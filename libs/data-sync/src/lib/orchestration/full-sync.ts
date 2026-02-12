import { EntityManager } from "typeorm";
import { DatastoreAdapter, RawDatastore } from "../adapters/datastore.adapter";
import { NamespaceAdapter, RawNamespace } from "../adapters/namespace.adapter";
import { GroupAdapter, RawGroup } from "../adapters/group.adapter";
import { RawSnapshot, SnapshotAdapter } from "../adapters/snapshot.adapter";
import { ArchiveAdapter, RawArchive } from "../adapters/archive.adapter";
import { Key } from "../engine/adapter";
import { Datastore, Group, Namespace, Snapshot } from "@pbs-manager/database-schema";
import { reconcile } from "../engine/reconcile";
import { wireNamespaceParents } from "./wire-namespace";

export interface ParsedData {
    datastores: RawDatastore[];
    namespaces: RawNamespace[];
    groups: RawGroup[];
    snapshots: RawSnapshot[];
    archives: RawArchive[];
}

export async function runFullSync(entityManager: EntityManager, parsedData: ParsedData, hostId: number): Promise<void> {
    const timestamp: Date = new Date();
    // Datastores
    const datastoreAdapter: DatastoreAdapter = new DatastoreAdapter(
        hostId,
        parsedData.datastores.map(ds => ds.mountpoint)
    );
    const datastoreMap: Map<Key, Datastore> = await reconcile<Datastore, RawDatastore>(
        entityManager,
        parsedData.datastores,
        timestamp,
        datastoreAdapter,
        { filterRelevant: true }
    );

    // Namespaces
    const namespaceMaps: Map<number, Map<Key, Namespace>> = new Map<number, Map<Key, Namespace>>();
    for (const datastore of datastoreMap.values()) {
        const datastoreNamespaces: RawNamespace[] = parsedData.namespaces.filter(
            ns => ns.datastoreMountpoint === datastore.mountpoint
        );
        const namespaceAdapter: NamespaceAdapter = new NamespaceAdapter(datastore.id);
        const namespaceMap: Map<Key, Namespace> = await reconcile<Namespace, RawNamespace>(
            entityManager,
            datastoreNamespaces,
            timestamp,
            namespaceAdapter
        );
        // Wire tree
        wireNamespaceParents(namespaceMap.values());
        await entityManager.save(Array.from(namespaceMap.values()));
        namespaceMaps.set(datastore.id, namespaceMap);
    }

    // Groups
    const groupMaps: Map<number, Map<Key, Group>> = new Map<number, Map<Key, Group>>();
    for (const datastore of datastoreMap.values()) {
        const datastoreId: number = datastore.id;
        const namespaceMap: Map<Key, Namespace> | undefined = namespaceMaps.get(datastoreId);
        if (!namespaceMap) {
            throw new Error(`Namespace map for datastore with id ${datastoreId} not found`);
        }
        const datastoreGroups: RawGroup[] = parsedData.groups.filter(
            group => group.datastoreMountpoint === datastore.mountpoint
        );
        const groupAdapter: GroupAdapter = new GroupAdapter(datastoreId, namespaceMap);
        const groupMap: Map<Key, Group> = await reconcile<Group, RawGroup>(
            entityManager,
            datastoreGroups,
            timestamp,
            groupAdapter
        );
        groupMaps.set(datastoreId, groupMap);
    }

    // Snapshots
    const snapshotMaps: Map<number, Map<Key, Snapshot>> = new Map<number, Map<Key, Snapshot>>();
    for (const datastore of datastoreMap.values()) {
        const datastoreId: number = datastore.id;
        const groupMap: Map<Key, Group> | undefined = groupMaps.get(datastoreId);
        if (!groupMap) {
            throw new Error(`Group map for datastore with id ${datastoreId} not found`);
        }
        const datastoreSnapshots: RawSnapshot[] = parsedData.snapshots.filter(
            snapshot => snapshot.groupKey.startsWith(`${datastore.mountpoint}::`) //FIXME This does not work
        );
        const snapshotAdapter: SnapshotAdapter = new SnapshotAdapter(datastoreId, groupMap);
        const snapshotMap: Map<Key, Snapshot> = await reconcile<Snapshot, RawSnapshot>(
            entityManager,
            datastoreSnapshots,
            timestamp,
            snapshotAdapter
        );
        snapshotMaps.set(datastoreId, snapshotMap);
    }

    // Archives
    for (const datastore of datastoreMap.values()) {
        const datastoreId: number = datastore.id;
        const snapshotMap: Map<Key, Snapshot> | undefined = snapshotMaps.get(datastoreId);
        if (!snapshotMap) {
            throw new Error(`Snapshot map for datastore with id ${datastoreId} not found`);
        }
        const datastoreArchives: RawArchive[] = parsedData.archives.filter(
            archive => archive.snapshotKey.startsWith(`${datastore.mountpoint}::`) //FIXME This does not work
        );
        const archiveAdapter: ArchiveAdapter = new ArchiveAdapter(datastoreId, snapshotMap);
        await reconcile<unknown, RawArchive>(entityManager, datastoreArchives, timestamp, archiveAdapter);
    }
}
