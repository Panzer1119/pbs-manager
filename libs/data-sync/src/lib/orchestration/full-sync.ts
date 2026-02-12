import { EntityManager } from "typeorm";
import { DatastoreAdapter, RawDatastore } from "../adapters/datastore.adapter";
import { NamespaceAdapter, RawNamespace } from "../adapters/namespace.adapter";
import { GroupAdapter, RawGroup } from "../adapters/group.adapter";
import { RawSnapshot, SnapshotAdapter } from "../adapters/snapshot.adapter";
import { FileArchiveAdapter, RawFileArchive } from "../adapters/file-archive.adapter";
import { ImageArchiveAdapter, RawImageArchive } from "../adapters/image-archive.adapter";
import { Key } from "../engine/adapter";
import { Datastore, FileArchive, Group, ImageArchive, Namespace, Snapshot } from "@pbs-manager/database-schema";
import { reconcile } from "../engine/reconcile";
import { wireNamespaceParents } from "./wire-namespace";
import { Logger } from "@nestjs/common";

export interface ParsedData {
    datastores: RawDatastore[];
    namespaces: RawNamespace[];
    groups: RawGroup[];
    snapshots: RawSnapshot[];
    fileArchives: RawFileArchive[];
    imageArchives: RawImageArchive[];
}

export async function runFullSync(
    entityManager: EntityManager,
    parsedData: ParsedData,
    hostId: number,
    logger: Logger
): Promise<void> {
    logger.log(`Starting full sync for host ID ${hostId}`);
    const timestamp: Date = new Date();
    // Datastores
    logger.debug(`Syncing ${parsedData.datastores.length} datastore(s)`);
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
    logger.log(`Completed datastore sync: ${datastoreMap.size} datastore(s) processed`);
    const singleDatastore: boolean = datastoreMap.size === 1;
    if (singleDatastore) {
        logger.verbose("Single datastore detected, all entities will be associated with this datastore");
    }

    // Namespaces
    logger.debug(`Syncing ${parsedData.namespaces.length} namespace(s) for ${datastoreMap.size} datastore(s)`);
    const namespaceMaps: Map<number, Map<Key, Namespace>> = new Map<number, Map<Key, Namespace>>();
    for (const datastore of datastoreMap.values()) {
        const datastoreNamespaces: RawNamespace[] = singleDatastore
            ? parsedData.namespaces
            : parsedData.namespaces.filter(ns => ns.datastoreMountpoint === datastore.mountpoint);
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
    logger.log(
        `Completed namespace sync: ${Array.from(namespaceMaps.values()).reduce((acc, map) => acc + map.size, 0)} namespace(s) processed`
    );

    // Groups
    logger.debug(`Syncing ${parsedData.groups.length} group(s) for ${datastoreMap.size} datastore(s)`);
    const groupMaps: Map<number, Map<Key, Group>> = new Map<number, Map<Key, Group>>();
    for (const datastore of datastoreMap.values()) {
        const datastoreId: number = datastore.id;
        const namespaceMap: Map<Key, Namespace> | undefined = namespaceMaps.get(datastoreId);
        if (!namespaceMap) {
            throw new Error(`Namespace map for datastore with id ${datastoreId} not found`);
        }
        const datastoreGroups: RawGroup[] = singleDatastore
            ? parsedData.groups
            : parsedData.groups.filter(group => group.datastoreMountpoint === datastore.mountpoint);
        const groupAdapter: GroupAdapter = new GroupAdapter(datastoreId, namespaceMap);
        const groupMap: Map<Key, Group> = await reconcile<Group, RawGroup>(
            entityManager,
            datastoreGroups,
            timestamp,
            groupAdapter
        );
        groupMaps.set(datastoreId, groupMap);
    }
    logger.log(
        `Completed group sync: ${Array.from(groupMaps.values()).reduce((acc, map) => acc + map.size, 0)} group(s) processed`
    );

    // Snapshots
    logger.debug(`Syncing ${parsedData.snapshots.length} snapshot(s) for ${datastoreMap.size} datastore(s)`);
    const snapshotMaps: Map<number, Map<Key, Snapshot>> = new Map<number, Map<Key, Snapshot>>();
    for (const datastore of datastoreMap.values()) {
        const datastoreId: number = datastore.id;
        const groupMap: Map<Key, Group> | undefined = groupMaps.get(datastoreId);
        if (!groupMap) {
            throw new Error(`Group map for datastore with id ${datastoreId} not found`);
        }
        const groupKeys: Set<Key> = new Set(groupMap.keys());
        const datastoreSnapshots: RawSnapshot[] = singleDatastore
            ? parsedData.snapshots
            : parsedData.snapshots.filter(snapshot => groupKeys.has(snapshot.groupKey));
        const snapshotAdapter: SnapshotAdapter = new SnapshotAdapter(datastoreId, groupMap);
        const snapshotMap: Map<Key, Snapshot> = await reconcile<Snapshot, RawSnapshot>(
            entityManager,
            datastoreSnapshots,
            timestamp,
            snapshotAdapter
        );
        snapshotMaps.set(datastoreId, snapshotMap);
    }
    logger.log(
        `Completed snapshot sync: ${Array.from(snapshotMaps.values()).reduce((acc, map) => acc + map.size, 0)} snapshot(s) processed`
    );

    // File Archives
    logger.debug(`Syncing ${parsedData.fileArchives.length} file archive(s) for ${datastoreMap.size} datastore(s)`);
    for (const datastore of datastoreMap.values()) {
        const datastoreId: number = datastore.id;
        const snapshotMap: Map<Key, Snapshot> | undefined = snapshotMaps.get(datastoreId);
        if (!snapshotMap) {
            throw new Error(`Snapshot map for datastore with id ${datastoreId} not found`);
        }
        const snapshotKeys: Set<Key> = new Set(snapshotMap.keys());
        const datastoreFileArchives: RawFileArchive[] = singleDatastore
            ? parsedData.fileArchives
            : parsedData.fileArchives.filter(archive => snapshotKeys.has(archive.snapshotKey));
        const fileArchiveAdapter: FileArchiveAdapter = new FileArchiveAdapter(datastoreId, snapshotMap);
        await reconcile<FileArchive, RawFileArchive>(
            entityManager,
            datastoreFileArchives,
            timestamp,
            fileArchiveAdapter
        );
    }
    logger.log(`Completed file archive sync: ${parsedData.fileArchives.length} archive(s) processed`);
    logger.log(`Full sync completed for host ID ${hostId}`);

    // Image Archives
    logger.debug(`Syncing ${parsedData.imageArchives.length} image archive(s) for ${datastoreMap.size} datastore(s)`);
    for (const datastore of datastoreMap.values()) {
        const datastoreId: number = datastore.id;
        const snapshotMap: Map<Key, Snapshot> | undefined = snapshotMaps.get(datastoreId);
        if (!snapshotMap) {
            throw new Error(`Snapshot map for datastore with id ${datastoreId} not found`);
        }
        const snapshotKeys: Set<Key> = new Set(snapshotMap.keys());
        const datastoreImageArchives: RawImageArchive[] = singleDatastore
            ? parsedData.imageArchives
            : parsedData.imageArchives.filter(archive => snapshotKeys.has(archive.snapshotKey));
        const imageArchiveAdapter: ImageArchiveAdapter = new ImageArchiveAdapter(datastoreId, snapshotMap);
        await reconcile<ImageArchive, RawImageArchive>(
            entityManager,
            datastoreImageArchives,
            timestamp,
            imageArchiveAdapter
        );
    }
    logger.log(`Completed image archive sync: ${parsedData.imageArchives.length} archive(s) processed`);
    logger.log(`Full sync completed for host ID ${hostId}`);
}
