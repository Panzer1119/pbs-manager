import { Key, ReconcileAdapter } from "../engine/adapter";
import { EntityManager, EntityTarget, ObjectLiteral, QueryDeepPartialEntity } from "typeorm";
import { makeKey } from "../engine/key";
import { ArchiveType, FileArchive, Group, Snapshot } from "@pbs-manager/database-schema";
import { SnapshotAdapter } from "./snapshot.adapter";
import { GroupAdapter } from "./group.adapter";

export interface RawFileArchive {
    snapshotKey: string;
    name: string;
    uuid?: string;
    creation?: Date;
    indexHashSHA256?: string;
}

export class FileArchiveAdapter implements ReconcileAdapter<FileArchive, RawFileArchive> {
    constructor(
        private readonly datastoreId: number,
        private readonly snapshotMap: Map<Key, Snapshot>
    ) {}

    getTarget(): EntityTarget<ObjectLiteral> {
        return FileArchive;
    }

    getCompositeKeyProperties(): (keyof FileArchive)[] {
        return ["snapshotId", "type", "name"];
    }

    async load(entityManager: EntityManager): Promise<FileArchive[]> {
        return entityManager.find(FileArchive, {
            where: { datastoreId: this.datastoreId },
            relations: { snapshot: { group: { datastore: true, namespace: true } } },
            withDeleted: true,
        });
    }

    entityKey(entity: FileArchive): Key {
        const snapshot: Snapshot | undefined = entity.snapshot;
        if (!snapshot) {
            throw new Error(`FileArchive with id ${entity.id} has no snapshot`);
        }
        const group: Group | undefined = snapshot.group;
        if (!group) {
            throw new Error(`Snapshot with id ${snapshot.id} has no group for FileArchive with id ${entity.id}`);
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

    rawKey(raw: RawFileArchive): Key {
        return makeKey(raw.snapshotKey, ArchiveType.File, raw.name);
    }

    create(raw: RawFileArchive): QueryDeepPartialEntity<FileArchive> {
        const snapshot: Snapshot | null = this.snapshotMap.get(raw.snapshotKey) ?? null;
        if (!snapshot) {
            throw new Error(`Snapshot with key ${raw.snapshotKey} not found for FileArchive`);
        }
        if (!snapshot.id) {
            throw new Error(`Snapshot with key ${raw.snapshotKey} has no id for FileArchive`);
        }
        return {
            datastoreId: this.datastoreId,
            snapshotId: snapshot.id,
            // snapshot,
            // type: raw.type,
            name: raw.name,
            uuid: raw.uuid,
            creation: raw.creation,
            indexHashSHA256: raw.indexHashSHA256,
        };
    }

    update(entity: FileArchive, raw: RawFileArchive): FileArchive | QueryDeepPartialEntity<FileArchive> {
        const snapshot: Snapshot | null = raw.snapshotKey ? (this.snapshotMap.get(raw.snapshotKey) ?? null) : null;
        if (!snapshot) {
            throw new Error(`Snapshot with key ${raw.snapshotKey} not found for FileArchive`);
        }
        if (!snapshot.id) {
            throw new Error(`Snapshot with key ${raw.snapshotKey} has no id for FileArchive`);
        }
        if (
            (entity.snapshotId ?? null) !== (snapshot?.id ?? null) ||
            entity.snapshot?.id !== snapshot?.id ||
            entity.snapshot?.time !== snapshot?.time
        ) {
            entity.snapshotId = (snapshot?.id ?? null) as number;
            // entity.snapshot = snapshot as Snapshot;
        }

        // if (entity.type !== raw.type) {
        //     entity.type = raw.type;
        // }
        if (entity.name !== raw.name) {
            entity.name = raw.name;
        }

        let hasChanges: boolean = false;
        if (entity.uuid !== raw.uuid) {
            entity.uuid = raw.uuid;
            hasChanges = true;
        }
        if (entity.creation?.getTime() !== raw.creation?.getTime()) {
            entity.creation = raw.creation;
            hasChanges = true;
        }
        if (entity.indexHashSHA256 !== raw.indexHashSHA256) {
            entity.indexHashSHA256 = raw.indexHashSHA256;
            hasChanges = true;
        }
        if (hasChanges) {
            entity.metadata.version++;
        }
        return entity;
    }

    mark(entity: FileArchive, timestamp: Date): void {
        if (!entity.metadata) {
            entity.metadata = { creation: timestamp, update: timestamp, deletion: null as unknown as Date, version: 1 };
        }
        let hasChanges: boolean = false;
        if (entity.metadata.update?.getTime() !== timestamp.getTime()) {
            entity.metadata.update = timestamp;
            // hasChanges = true; // Do not spam the version number if only the update timestamp changes
        }
        if (entity.metadata.deletion != null) {
            entity.metadata.deletion = null as unknown as Date;
            hasChanges = true;
        }
        if (hasChanges) {
            entity.metadata.version++;
        }
    }

    updateId(entity: FileArchive, id: ObjectLiteral): void {
        entity.id = id["id"];
    }

    async sweep(entityManager: EntityManager, timestamp: Date): Promise<void> {
        await entityManager
            .createQueryBuilder()
            .update(FileArchive)
            .set({ metadata: { deletion: timestamp } })
            .where("datastoreId = :datastoreId", { datastoreId: this.datastoreId })
            .andWhere("metadata_update < :timestamp", { timestamp })
            .andWhere("metadata_deletion IS NULL")
            .execute();
    }
}
