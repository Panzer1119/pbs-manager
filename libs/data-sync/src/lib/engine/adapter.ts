import { EntityManager } from "typeorm";

export type Key = string;

export interface ReconcileAdapter<T, R> {
    load(entityManager: EntityManager): Promise<T[]>;
    entityKey(entity: T): Key;
    rawKey(raw: R): Key;
    create(entityManager: EntityManager, raw: R): Promise<T> | T;
    update(entityManager: EntityManager, entity: T, raw: R): Promise<void> | void;
    mark(entity: T, timestamp: Date): Promise<void> | void;
    sweep(entityManager: EntityManager, timestamp: Date): Promise<void> | void;
}
