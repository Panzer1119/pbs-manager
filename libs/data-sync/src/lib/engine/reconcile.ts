import { EntityManager } from "typeorm";
import { Key, ReconcileAdapter } from "./adapter";

export async function reconcile<T, R>(
    entityManager: EntityManager,
    raws: Iterable<R>,
    timestamp: Date,
    adapter: ReconcileAdapter<T, R>
): Promise<Map<Key, T>> {
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
            //TODO But we need to ensure that at least the metadata update field is newer than our timestamp
            // Mark the entity as processed
            await adapter.mark(entity, timestamp);
        } else {
            // Create new entity
            entity = await adapter.create(entityManager, raw);
            // Add the entity to the map
            entityMap.set(rawKey, entity);
        }
        //TODO Maybe we can skip the marking step, as the metadata update field should be newer than our timestamp anyway?
        // // Mark the entity as processed
        // await adapter.mark(entity, timestamp);
    }
    // Persist
    await entityManager.save(Array.from(entityMap.values()));
    // Sweep
    await adapter.sweep(entityManager, timestamp);
    return entityMap;
}
