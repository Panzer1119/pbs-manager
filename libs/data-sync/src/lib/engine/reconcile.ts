import { EntityManager } from "typeorm";
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
    for (const raw of raws) {
        const rawKey: Key = adapter.rawKey(raw);
        let entity: T | undefined = entityMap.get(rawKey);
        if (entity) {
            // Update existing entity
            await adapter.update(entityManager, entity, raw);
        } else {
            // Create new entity
            entity = await adapter.create(entityManager, raw);
            // Add the entity to the map
            entityMap.set(rawKey, entity);
        }
        // Mark the entity as processed
        await adapter.mark(entity, timestamp);
    }
    // Persist
    await entityManager.save(Array.from(entityMap.values()));
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
