import { Key, ReconcileAdapter } from "../engine/adapter";
import { EntityManager } from "typeorm";
import { makeKey } from "../engine/key";
import { Group, Snapshot } from "@pbs-manager/database-schema";
import { GroupAdapter } from "./group.adapter";

export interface RawSnapshot {
    groupKey: string;
    timestamp: Date;
}

export class SnapshotAdapter implements ReconcileAdapter<Snapshot, RawSnapshot> {
    constructor(
        private readonly datastoreId: number,
        private readonly groupMap: Map<Key, Group>
    ) {}

    async load(entityManager: EntityManager): Promise<Snapshot[]> {
        return entityManager.find(Snapshot, {
            where: { datastoreId: this.datastoreId },
            relations: { group: { datastore: true, namespace: true } },
            withDeleted: true,
        });
    }

    public static key(groupKey: Key, timestamp: Date): Key {
        return makeKey(groupKey, timestamp);
    }

    entityKey(entity: Snapshot): Key {
        const group: Group | undefined = entity.group;
        if (!group) {
            throw new Error(`Snapshot with id ${entity.id} has no group`);
        }
        const groupKey: Key = GroupAdapter.key(
            group.datastore?.mountpoint,
            group.namespace?.path,
            group.type,
            group.backupId
        );
        return SnapshotAdapter.key(groupKey, entity.time);
    }

    rawKey(raw: RawSnapshot): Key {
        return SnapshotAdapter.key(raw.groupKey, raw.timestamp);
    }

    create(entityManager: EntityManager, raw: RawSnapshot): Snapshot {
        const group: Group | undefined = this.groupMap.get(raw.groupKey);
        if (!group) {
            throw new Error(`Group with key ${raw.groupKey} not found for snapshot`);
        }
        return entityManager.create(Snapshot, {
            datastoreId: this.datastoreId,
            group,
            time: raw.timestamp,
        });
    }

    update(entityManager: EntityManager, entity: Snapshot, raw: RawSnapshot): void {
        const groupKey: Key | null = raw.groupKey ? makeKey(this.datastoreId, raw.groupKey) : null;
        const group: Group | undefined = groupKey ? this.groupMap.get(groupKey) : undefined;
        if (
            entity.group?.id !== group?.id ||
            entity.group?.type !== group?.type ||
            entity.group?.backupId !== group?.backupId
        ) {
            entity.group = group;
        }
    }

    mark(entity: Snapshot, timestamp: Date): void {
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

    async sweep(entityManager: EntityManager, timestamp: Date): Promise<void> {
        await entityManager
            .createQueryBuilder()
            .update(Snapshot)
            .set({ metadata: { deletion: timestamp } })
            .where("datastoreId = :datastoreId", { datastoreId: this.datastoreId })
            .andWhere("metadata_update < :timestamp", { timestamp })
            .andWhere("metadata_deletion IS NULL")
            .execute();
    }
}
