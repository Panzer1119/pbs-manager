import { Key, ReconcileAdapter } from "../engine/adapter";
import { EntityManager, EntityTarget, ObjectLiteral, QueryDeepPartialEntity } from "typeorm";
import { makeKey } from "../engine/key";
import { Archive, ArchiveType, Group, Snapshot } from "@pbs-manager/database-schema";
import { SnapshotAdapter } from "./snapshot.adapter";
import { GroupAdapter } from "./group.adapter";

export interface RawArchive {
    snapshotKey: string;
    type: ArchiveType;
    name: string;
    uuid?: string;
    creation?: Date;
    indexHashSHA256?: string;
}

export class ArchiveAdapter implements ReconcileAdapter<Archive, RawArchive> {
    constructor(
        private readonly datastoreId: number,
        private readonly snapshotMap: Map<Key, Snapshot>
    ) {}

    getTarget(): EntityTarget<ObjectLiteral> {
        return Archive;
    }
    getCompositeKeyProperties(): (keyof Archive)[] {
        return ["snapshotId", "type", "name"];
    }

    async load(entityManager: EntityManager): Promise<Archive[]> {
        return entityManager.find(Archive, {
            where: { datastoreId: this.datastoreId },
            relations: { snapshot: { group: { datastore: true, namespace: true } } },
            withDeleted: true,
        });
    }

    entityKey(entity: Archive): Key {
        const snapshot: Snapshot | undefined = entity.snapshot;
        if (!snapshot) {
            throw new Error(`Archive with id ${entity.id} has no snapshot`);
        }
        const group: Group | undefined = snapshot.group;
        if (!group) {
            throw new Error(`Snapshot with id ${snapshot.id} has no group for Archive with id ${entity.id}`);
        }
        const groupKey: Key = GroupAdapter.key(
            group.datastore?.mountpoint,
            group.namespace?.path,
            group.type,
            group.backupId
        );
        const snapshotKey: Key = SnapshotAdapter.key(groupKey, snapshot.time);
        return makeKey(snapshotKey, entity.type, entity.name);
    }

    rawKey(raw: RawArchive): Key {
        return makeKey(raw.snapshotKey, raw.type, raw.name);
    }

    create(raw: RawArchive): QueryDeepPartialEntity<Archive> {
        const snapshot: Snapshot | null = this.snapshotMap.get(raw.snapshotKey) ?? null;
        if (!snapshot) {
            throw new Error(`Snapshot with key ${raw.snapshotKey} not found for Archive`);
        }
        return {
            datastoreId: this.datastoreId,
            snapshotId: snapshot.id,
            snapshot,
            type: raw.type,
            name: raw.name,
            uuid: raw.uuid,
            creation: raw.creation,
            indexHashSHA256: raw.indexHashSHA256,
        };
    }

    update(entity: Archive, raw: RawArchive): Archive | QueryDeepPartialEntity<Archive> {
        const snapshot: Snapshot | null = raw.snapshotKey ? (this.snapshotMap.get(raw.snapshotKey) ?? null) : null;
        if (!snapshot) {
            throw new Error(`Snapshot with key ${raw.snapshotKey} not found for Archive`);
        }
        if (
            (entity.snapshotId ?? null) !== (snapshot?.id ?? null) ||
            entity.snapshot?.id !== snapshot?.id ||
            entity.snapshot?.time !== snapshot?.time
        ) {
            entity.snapshotId = snapshot?.id as number;
            entity.snapshot = snapshot as Snapshot;
        }

        if (entity.type !== raw.type) {
            entity.type = raw.type;
        }
        if (entity.name !== raw.name) {
            entity.name = raw.name;
        }
        if (entity.uuid !== raw.uuid) {
            entity.uuid = raw.uuid;
        }
        if (entity.creation?.getTime() !== raw.creation?.getTime()) {
            entity.creation = raw.creation;
        }
        if (entity.indexHashSHA256 !== raw.indexHashSHA256) {
            entity.indexHashSHA256 = raw.indexHashSHA256;
        }
        return entity;
    }

    mark(entity: Archive, timestamp: Date): void {
        if (!entity.metadata) {
            entity.metadata = { creation: timestamp, update: timestamp, deletion: null as unknown as Date, version: 1 };
        }
        if (entity.metadata.update?.getTime() !== timestamp.getTime()) {
            entity.metadata.update = timestamp;
        }
        if (entity.metadata.deletion != null) {
            entity.metadata.deletion = null as unknown as Date;
        }
    }

    updateId(entity: Archive, id: ObjectLiteral): void {
        entity.id = id["id"];
    }

    async sweep(entityManager: EntityManager, timestamp: Date): Promise<void> {
        await entityManager
            .createQueryBuilder()
            .update(Archive)
            .set({ metadata: { deletion: timestamp } })
            .where("datastoreId = :datastoreId", { datastoreId: this.datastoreId })
            .andWhere("metadata_update < :timestamp", { timestamp })
            .andWhere("metadata_deletion IS NULL")
            .execute();
    }
}
