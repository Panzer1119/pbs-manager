import { Key, ReconcileAdapter } from "../engine/adapter";
import { EntityManager, EntityTarget, ObjectLiteral, QueryDeepPartialEntity } from "typeorm";
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

    getTarget(): EntityTarget<ObjectLiteral> {
        return Snapshot;
    }
    getCompositeKeyProperties(): (keyof Snapshot)[] {
        return ["groupId", "time"];
    }

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

    create(raw: RawSnapshot): QueryDeepPartialEntity<Snapshot> {
        const group: Group | null = this.groupMap.get(raw.groupKey) ?? null;
        if (!group) {
            throw new Error(`Group with key ${raw.groupKey} not found for snapshot`);
        }
        return {
            datastoreId: this.datastoreId,
            groupId: group.id,
            group,
            time: raw.timestamp,
        };
    }

    update(entity: Snapshot, raw: RawSnapshot): Snapshot | QueryDeepPartialEntity<Snapshot> {
        const groupKey: Key | null = raw.groupKey ? makeKey(this.datastoreId, raw.groupKey) : null;
        const group: Group | null = groupKey ? (this.groupMap.get(groupKey) ?? null) : null;
        if (
            (entity.groupId ?? null) !== (group?.id ?? null) ||
            entity.group?.id !== group?.id ||
            entity.group?.type !== group?.type ||
            entity.group?.backupId !== group?.backupId
        ) {
            entity.groupId = group?.id as number;
            entity.group = group as Group;
        }
        return entity;
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

    updateId(entity: Snapshot, id: ObjectLiteral): void {
        entity.id = id["id"];
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
