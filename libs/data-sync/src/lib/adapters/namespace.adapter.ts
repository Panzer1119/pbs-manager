import { Key, ReconcileAdapter } from "../engine/adapter";
import { EntityManager } from "typeorm";
import { makeKey } from "../engine/key";
import { Namespace } from "@pbs-manager/database-schema";

export interface RawNamespace {
    datastoreMountpoint: string;
    parts: string[];
}

export class NamespaceAdapter implements ReconcileAdapter<Namespace, RawNamespace> {
    constructor(private readonly datastoreId: number) {}

    async load(entityManager: EntityManager): Promise<Namespace[]> {
        return entityManager.find(Namespace, { where: { datastoreId: this.datastoreId }, withDeleted: true });
    }

    entityKey(entity: Namespace): Key {
        return makeKey(entity.datastoreId, entity.path);
    }

    rawKey(raw: RawNamespace): Key {
        return makeKey(this.datastoreId, raw.parts.join("/"));
    }

    create(entityManager: EntityManager, raw: RawNamespace): Namespace {
        const path: string = raw.parts.join("/");
        return entityManager.create(Namespace, {
            datastoreId: this.datastoreId,
            name: raw.parts.at(-1),
            path,
            parent: undefined, // Should be null either way, because it is new
        });
    }

    update(entityManager: EntityManager, entity: Namespace, raw: RawNamespace): void {
        // No updatable fields
    }

    mark(entity: Namespace, timestamp: Date): void {
        if (!entity.metadata) {
            entity.metadata = { creation: timestamp, update: timestamp, deletion: undefined, version: 1 };
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
            .update(Namespace)
            .set({ metadata: { deletion: timestamp } })
            .where("datastoreId = :datastoreId", { datastoreId: this.datastoreId })
            .andWhere("metadata_update < :timestamp", { timestamp })
            .andWhere("metadata_deletion IS NULL")
            .execute();
    }
}
