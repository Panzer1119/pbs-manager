import { Key, ReconcileAdapter } from "../engine/adapter";
import { EntityManager, EntityTarget, ObjectLiteral, QueryDeepPartialEntity } from "typeorm";
import { makeKey } from "../engine/key";
import { ArchiveType, Group, ImageArchive, Snapshot } from "@pbs-manager/database-schema";
import { SnapshotAdapter } from "./snapshot.adapter";
import { GroupAdapter } from "./group.adapter";
import { FixedIndex } from "../parser/index.parser";

export interface RawImageArchive extends Partial<FixedIndex> {
    snapshotKey: string;
    name: string;
}

export class ImageArchiveAdapter implements ReconcileAdapter<ImageArchive, RawImageArchive> {
    constructor(
        private readonly datastoreId: number,
        private readonly snapshotMap: Map<Key, Snapshot>
    ) {}

    getTarget(): EntityTarget<ObjectLiteral> {
        return ImageArchive;
    }

    getCompositeKeyProperties(): (keyof ImageArchive)[] {
        return ["snapshotId", "type", "name"];
    }

    async load(entityManager: EntityManager): Promise<ImageArchive[]> {
        return entityManager.find(ImageArchive, {
            where: { datastoreId: this.datastoreId },
            relations: { snapshot: { group: { datastore: true, namespace: true } } },
            withDeleted: true,
            lock: { mode: "pessimistic_write" },
        });
    }

    entityKey(entity: ImageArchive): Key {
        const snapshot: Snapshot | undefined = entity.snapshot;
        if (!snapshot) {
            throw new Error(`ImageArchive with id ${entity.id} has no snapshot`);
        }
        const group: Group | undefined = snapshot.group;
        if (!group) {
            throw new Error(`Snapshot with id ${snapshot.id} has no group for ImageArchive with id ${entity.id}`);
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

    rawKey(raw: RawImageArchive): Key {
        return makeKey(raw.snapshotKey, ArchiveType.Image, raw.name);
    }

    create(raw: RawImageArchive): QueryDeepPartialEntity<ImageArchive> {
        const snapshot: Snapshot | null = this.snapshotMap.get(raw.snapshotKey) ?? null;
        if (!snapshot) {
            throw new Error(`Snapshot with key ${raw.snapshotKey} not found for ImageArchive`);
        }
        if (!snapshot.id) {
            throw new Error(`Snapshot with key ${raw.snapshotKey} has no id for ImageArchive`);
        }
        return {
            datastoreId: this.datastoreId,
            snapshotId: snapshot.id,
            // snapshot,
            // type: raw.type,
            name: raw.name,
            uuid: raw.uuid,
            creation: raw.creation,
            indexHashSHA256: raw.checksum,
        };
    }

    update(entity: ImageArchive, raw: RawImageArchive): ImageArchive | QueryDeepPartialEntity<ImageArchive> {
        const snapshot: Snapshot | null = raw.snapshotKey ? (this.snapshotMap.get(raw.snapshotKey) ?? null) : null;
        if (!snapshot) {
            throw new Error(`Snapshot with key ${raw.snapshotKey} not found for ImageArchive`);
        }
        if (!snapshot.id) {
            throw new Error(`Snapshot with key ${raw.snapshotKey} has no id for ImageArchive`);
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
        if (entity.uuid !== raw.uuid && raw.uuid !== undefined) {
            entity.uuid = raw.uuid;
            hasChanges = true;
        }
        if (entity.creation?.getTime() !== raw.creation?.getTime() && raw.creation !== undefined) {
            entity.creation = raw.creation;
            hasChanges = true;
        }
        if (entity.indexHashSHA256 !== raw.checksum && raw.checksum !== undefined) {
            entity.indexHashSHA256 = raw.checksum;
            hasChanges = true;
        }
        if (entity.sizeBytes !== raw.sizeBytes && raw.sizeBytes !== undefined) {
            entity.sizeBytes = raw.sizeBytes || -1;
            hasChanges = true;
        }
        if (entity.chunkSizeBytes !== raw.chunkSizeBytes && raw.chunkSizeBytes !== undefined) {
            entity.chunkSizeBytes = raw.chunkSizeBytes || -1;
            hasChanges = true;
        }
        if (hasChanges) {
            entity.metadata.version++;
        }
        return entity;
    }

    mark(entity: ImageArchive, timestamp: Date): void {
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

    updateId(entity: ImageArchive, id: ObjectLiteral): void {
        entity.id = id["id"];
    }

    async sweep(entityManager: EntityManager, timestamp: Date): Promise<void> {
        await entityManager
            .createQueryBuilder()
            .update(ImageArchive)
            .set({ metadata: { deletion: timestamp } })
            .where("datastoreId = :datastoreId", { datastoreId: this.datastoreId })
            .andWhere("metadata_update < :timestamp", { timestamp })
            .andWhere("metadata_deletion IS NULL")
            .execute();
    }
}
