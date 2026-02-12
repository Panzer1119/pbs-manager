import { Key, ReconcileAdapter } from "../engine/adapter";
import { EntityManager, EntityTarget, ObjectLiteral, QueryDeepPartialEntity, UpdateQueryBuilder } from "typeorm";
import { makeKey } from "../engine/key";
import { Datastore } from "@pbs-manager/database-schema";

export interface RawDatastore {
    hostId: number;
    name: string;
    mountpoint: string;
}

export class DatastoreAdapter implements ReconcileAdapter<Datastore, RawDatastore> {
    constructor(
        private readonly hostId: number,
        private readonly datastoreMountpoints: string[] | null = null
    ) {}

    getTarget(): EntityTarget<ObjectLiteral> {
        return Datastore;
    }

    getCompositeKeyProperties(): (keyof Datastore)[] {
        return ["hostId", "name"];
    }

    async load(entityManager: EntityManager): Promise<Datastore[]> {
        return entityManager.find(Datastore, { where: { hostId: this.hostId }, withDeleted: true });
    }

    entityKey(entity: Datastore): Key {
        return makeKey(entity.hostId, entity.mountpoint);
    }

    rawKey(raw: RawDatastore): Key {
        return makeKey(raw.hostId, raw.mountpoint);
    }

    create(raw: RawDatastore): QueryDeepPartialEntity<Datastore> {
        return {
            hostId: raw.hostId,
            name: raw.name,
            mountpoint: raw.mountpoint,
        };
    }

    update(entity: Datastore, raw: RawDatastore): Datastore | QueryDeepPartialEntity<Datastore> {
        if (entity.name !== raw.name) {
            entity.name = raw.name;
        }
        if (entity.mountpoint !== raw.mountpoint) {
            entity.mountpoint = raw.mountpoint;
        }
        return entity;
    }

    mark(entity: Datastore, timestamp: Date): void {
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

    updateId(entity: Datastore, id: ObjectLiteral): void {
        entity.id = id["id"];
    }

    async sweep(entityManager: EntityManager, timestamp: Date): Promise<void> {
        let qb: UpdateQueryBuilder<Datastore> = entityManager
            .createQueryBuilder()
            .update(Datastore)
            .set({ metadata: { deletion: timestamp } })
            .where("hostId = :hostId", { hostId: this.hostId })
            .andWhere("metadata_update < :timestamp", { timestamp })
            .andWhere("metadata_deletion IS NULL");
        if (this.datastoreMountpoints != null) {
            qb = qb.andWhere("mountpoint IN (:...mountpoints)", { mountpoints: this.datastoreMountpoints });
        }
        await qb.execute();
    }

    async filterExisting(entityManager: EntityManager, entityMap: Map<Key, Datastore>): Promise<Map<Key, Datastore>> {
        const existingEntities: Datastore[] = await entityManager.findBy(Datastore, { hostId: this.hostId });
        const existingKeys: Set<Key> = new Set(existingEntities.map(entity => this.entityKey(entity)));
        for (const key of entityMap.keys()) {
            if (!existingKeys.has(key)) {
                entityMap.delete(key);
            }
        }
        return entityMap;
    }

    async filterRelevant(entityManager: EntityManager, entityMap: Map<Key, Datastore>): Promise<Map<Key, Datastore>> {
        if (!this.datastoreMountpoints) {
            return entityMap;
        }
        for (const [key, entity] of entityMap.entries()) {
            if (!entity.mountpoint || !this.datastoreMountpoints.includes(entity.mountpoint)) {
                entityMap.delete(key);
            }
        }
        return entityMap;
    }
}
