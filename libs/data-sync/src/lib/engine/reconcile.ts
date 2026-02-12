import { EntityManager, InsertResult, QueryDeepPartialEntity } from "typeorm";
import { Key, ReconcileAdapter } from "./adapter";

export interface ReconcileOptions {
    filterExisting?: boolean;
    filterRelevant?: boolean;
}

export async function reconcile<T, R>(
    entityManager: EntityManager,
    raws: Iterable<R>,
    timestamp: Date,
    adapter: ReconcileAdapter<T, R>,
    options?: ReconcileOptions
): Promise<Map<Key, T>> {
    options ??= {};
    const filterExisting: boolean = options.filterExisting ?? false;
    const filterRelevant: boolean = options.filterRelevant ?? false;
    // Load existing entities
    const entities: T[] = await adapter.load(entityManager);
    const entityMap: Map<Key, T> = new Map(entities.map(entity => [adapter.entityKey(entity), entity]));
    // Reconcile
    const entitiesToInsert: QueryDeepPartialEntity<T>[] = [];
    const entitiesToUpdate: QueryDeepPartialEntity<T>[] = [];
    for (const raw of raws) {
        const rawKey: Key = adapter.rawKey(raw);
        let entity: T | QueryDeepPartialEntity<T> | undefined = entityMap.get(rawKey);
        if (entity) {
            // Update existing entity
            entity = adapter.update(entity, raw);
            entitiesToUpdate.push(entity as QueryDeepPartialEntity<T>);
        } else {
            // Create new entity
            entity = adapter.create(raw);
            entitiesToInsert.push(entity);
            // Add the entity to the map
            entityMap.set(rawKey, entity as T);
        }
        // Mark the entity as processed
        adapter.mark(entity as T, timestamp);
    }
    // Persist
    const insertResult: InsertResult = await entityManager.insert(adapter.getTarget(), entitiesToInsert);
    if (insertResult.identifiers.length !== entitiesToInsert.length) {
        throw new Error(
            `Expected to insert ${entitiesToInsert.length} entities, but got ${insertResult.identifiers.length}`
        );
    }
    for (let i = 0; i < entitiesToInsert.length; i++) {
        adapter.updateId(entitiesToInsert[i] as T, insertResult.identifiers[i]);
    }
    if (adapter.getSelfReferenceKeyProperties) {
        for (const { objectKey, objectIdKey } of adapter.getSelfReferenceKeyProperties()) {
            for (const entity of entitiesToInsert) {
                const otherEntity: T | undefined | null = (entity as T)[objectKey] as T;
                if (otherEntity === undefined) {
                    continue;
                } else if (otherEntity === null) {
                    ((entity as T)[objectIdKey] as unknown) = null;
                } else {
                    ((entity as T)[objectIdKey] as unknown) = otherEntity[objectIdKey];
                }
                entitiesToUpdate.push(entity);
            }
        }
    }
    await entityManager.upsert(adapter.getTarget(), entitiesToUpdate, {
        conflictPaths: adapter.getCompositeKeyProperties() as string[],
        upsertType: "on-conflict-do-update",
    });
    // Sweep
    await adapter.sweep(entityManager, timestamp);
    let filteredEntityMap: Map<Key, T> = entityMap;
    if (filterExisting) {
        if (!adapter.filterExisting) {
            throw new Error("Adapter must implement filterExisting to return only non-deleted entities");
        }
        filteredEntityMap = await adapter.filterExisting(entityManager, filteredEntityMap);
    }
    if (filterRelevant) {
        if (!adapter.filterRelevant) {
            throw new Error("Adapter must implement filterRelevant to return only relevant entities");
        }
        filteredEntityMap = await adapter.filterRelevant(entityManager, filteredEntityMap);
    }
    return filteredEntityMap;
}
