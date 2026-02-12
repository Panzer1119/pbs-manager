import { Key, ReconcileAdapter } from "../engine/adapter";
import { EntityManager, EntityTarget, ObjectLiteral, QueryDeepPartialEntity } from "typeorm";
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

    getTarget(): EntityTarget<ObjectLiteral> {
        return Group;
    }
    getCompositeKeyProperties(): (keyof Group)[] {
        return ["datastoreId", "namespaceId", "type", "backupId"];
    }

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

    create(raw: RawGroup): QueryDeepPartialEntity<Group> {
        const namespaceKey: Key | null = raw.namespacePath ? makeKey(this.datastoreId, raw.namespacePath) : null;
        const namespace: Namespace | null = namespaceKey ? (this.namespaceMap.get(namespaceKey) ?? null) : null;
        return {
            datastoreId: this.datastoreId,
            namespaceId: namespace?.id ?? (null as unknown as number),
            namespace: namespace as unknown as Namespace,
            type: raw.backupType,
            backupId: raw.backupId,
        };
    }

    update(entity: Group, raw: RawGroup): Group | QueryDeepPartialEntity<Group> {
        const namespaceKey: Key | null = raw.namespacePath ? makeKey(this.datastoreId, raw.namespacePath) : null;
        const namespace: Namespace | null = namespaceKey ? (this.namespaceMap.get(namespaceKey) ?? null) : null;
        if (
            (entity.namespaceId ?? null) !== (namespace?.id ?? null) ||
            entity.namespace?.id !== namespace?.id ||
            entity.namespace?.path !== namespace?.path
        ) {
            entity.namespaceId = namespace?.id;
            entity.namespace = namespace as Namespace;
        }

        if (entity.type !== raw.backupType) {
            entity.type = raw.backupType;
        }
        if (entity.backupId !== raw.backupId) {
            entity.backupId = raw.backupId;
        }
        return entity;
    }

    mark(entity: Group, timestamp: Date): void {
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

    updateId(entity: Group, id: ObjectLiteral): void {
        entity.id = id["id"];
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
