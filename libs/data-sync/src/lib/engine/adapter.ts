import { EntityManager, EntityTarget, ObjectLiteral, QueryDeepPartialEntity } from "typeorm";

export type Key = string;

export interface ReconcileAdapter<T, R> {
    getTarget(): EntityTarget<ObjectLiteral>;
    getCompositeKeyProperties(): (keyof T)[];
    getSelfReferenceKeyProperties?(): { objectKey: keyof T; objectIdKey: keyof T }[];
    load(entityManager: EntityManager): Promise<T[]>;
    entityKey(entity: T): Key;
    rawKey(raw: R): Key;
    create(raw: R): QueryDeepPartialEntity<T>;
    update(entity: T, raw: R): T | QueryDeepPartialEntity<T>;
    mark(entity: T, timestamp: Date): void;
    updateId(entity: T, id: ObjectLiteral): void;
    sweep(entityManager: EntityManager, timestamp: Date): Promise<void> | void;
    filterExisting?(entityManager: EntityManager, entityMap: Map<Key, T>): Promise<Map<Key, T>> | Map<Key, T>;
    filterRelevant?(entityManager: EntityManager, entityMap: Map<Key, T>): Promise<Map<Key, T>> | Map<Key, T>;
}
