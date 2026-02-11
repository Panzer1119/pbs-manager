import { Key, ReconcileAdapter } from "../engine/adapter";
import { EntityManager } from "typeorm";
import { makeKey } from "../engine/key";
import { BackupType, Group, Namespace } from "@pbs-manager/database-schema";

export interface RawGroup {
    datastoreMountpoint: string;
    namespacePath?: string;
    backupType: BackupType;
    backupId: string;
}

export class GroupAdapter implements ReconcileAdapter<Group, RawGroup> {
    constructor(
        private readonly datastoreId: number,
        private readonly namespaceMap: Map<Key, Namespace>
    ) {}

    async load(entityManager: EntityManager): Promise<Group[]> {
        return entityManager.find(Group, {
            where: { datastoreId: this.datastoreId },
            relations: { datastore: true, namespace: true },
            withDeleted: true,
        });
    }

    public static key(
        datastoreMountpoint: string | null | undefined,
        namespacePath: string | null | undefined,
        backupType: BackupType,
        backupId: string
    ): Key {
        return makeKey(datastoreMountpoint ?? null, namespacePath ?? null, backupType, backupId);
    }

    entityKey(entity: Group): Key {
        if (!entity.datastore) {
            throw new Error(`Group with id ${entity.id} has no datastore`);
        }
        return GroupAdapter.key(entity.datastore?.mountpoint, entity.namespace?.path, entity.type, entity.backupId);
    }

    rawKey(raw: RawGroup): Key {
        return GroupAdapter.key(raw.datastoreMountpoint, raw.namespacePath, raw.backupType, raw.backupId);
    }

    create(entityManager: EntityManager, raw: RawGroup): Group {
        const namespaceKey: Key | null = raw.namespacePath ? makeKey(this.datastoreId, raw.namespacePath) : null;
        return entityManager.create(Group, {
            datastoreId: this.datastoreId,
            namespace: namespaceKey ? this.namespaceMap.get(namespaceKey) : undefined, // Should be null either way, because it is new
            type: raw.backupType,
            backupId: raw.backupId,
        });
    }

    update(entityManager: EntityManager, entity: Group, raw: RawGroup): void {
        const namespaceKey: Key | null = raw.namespacePath ? makeKey(this.datastoreId, raw.namespacePath) : null;
        const namespace: Namespace | undefined = namespaceKey ? this.namespaceMap.get(namespaceKey) : undefined;
        if (entity.namespace?.id !== namespace?.id || entity.namespace?.path !== namespace?.path) {
            entity.namespace = namespace;
        }

        if (entity.type !== raw.backupType) {
            entity.type = raw.backupType;
        }
        if (entity.backupId !== raw.backupId) {
            entity.backupId = raw.backupId;
        }
    }

    mark(entity: Group, timestamp: Date): void {
        if (!entity.metadata) {
            entity.metadata = { creation: timestamp, update: timestamp, deletion: undefined, version: 1 };
        }
        if (entity.metadata.update?.getTime() !== timestamp.getTime()) {
            entity.metadata.update = timestamp;
        }
        if (entity.metadata.deletion != null) {
            //TODO Ensure that setting deletion to undefined sets it null in the database and not just ignores the update
            entity.metadata.deletion = undefined;
        }
    }

    async sweep(entityManager: EntityManager, timestamp: Date): Promise<void> {
        await entityManager
            .createQueryBuilder()
            .update(Group)
            .set({ metadata: { deletion: timestamp } })
            .where("datastoreId = :datastoreId", { datastoreId: this.datastoreId })
            .andWhere("metadata_update < :timestamp", { timestamp })
            .andWhere("metadata_deletion IS NULL")
            .execute();
    }
}
