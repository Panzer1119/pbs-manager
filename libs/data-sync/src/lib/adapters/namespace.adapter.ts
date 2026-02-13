import { Key, ReconcileAdapter } from "../engine/adapter";
import { EntityManager, EntityTarget, ObjectLiteral, QueryDeepPartialEntity } from "typeorm";
import { makeKey } from "../engine/key";
import { Namespace } from "@pbs-manager/database-schema";

export interface RawNamespace {
    datastoreMountpoint: string;
    path: string;
}

export class NamespaceAdapter implements ReconcileAdapter<Namespace, RawNamespace> {
    constructor(private readonly datastoreId: number) {}

    getTarget(): EntityTarget<ObjectLiteral> {
        return Namespace;
    }

    getCompositeKeyProperties(): (keyof Namespace)[] {
        return ["datastoreId", "parentId", "name"];
    }

    // Not necessary as the parents are wired later on manually anyway
    // getSelfReferenceKeyProperties?(): { objectKey: keyof Namespace; objectIdKey: keyof Namespace }[] {
    //     return [{ objectKey: "parent", objectIdKey: "parentId" }];
    // }

    async load(entityManager: EntityManager): Promise<Namespace[]> {
        return entityManager.find(Namespace, {
            where: { datastoreId: this.datastoreId },
            withDeleted: true,
            lock: { mode: "pessimistic_write" },
        });
    }

    entityKey(entity: Namespace): Key {
        return makeKey(entity.datastoreId, entity.path);
    }

    rawKey(raw: RawNamespace): Key {
        return makeKey(this.datastoreId, raw.path);
    }

    create(raw: RawNamespace): QueryDeepPartialEntity<Namespace> {
        return {
            datastoreId: this.datastoreId,
            name: raw.path.at(-1),
            path: raw.path,
            parentId: null as unknown as number,
            parent: null as unknown as Namespace,
        };
    }

    update(entity: Namespace, raw: RawNamespace): Namespace | QueryDeepPartialEntity<Namespace> {
        // No updatable fields
        return entity;
    }

    mark(entity: Namespace, timestamp: Date): void {
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

    updateId(entity: Namespace, id: ObjectLiteral): void {
        entity.id = id["id"];
    }

    async sweep(entityManager: EntityManager, timestamp: Date): Promise<void> {
        await entityManager
            .createQueryBuilder()
            .update(Namespace)
            .set({ metadata: { deletion: timestamp } })
            .where("datastoreId = :datastoreId", { datastoreId: this.datastoreId })
            .andWhere("metadata_update < :timestamp", { timestamp })
            .andWhere("metadata_deletion IS NULL")
            .execute();
    }
}
