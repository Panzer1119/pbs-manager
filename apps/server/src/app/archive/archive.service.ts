import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager, EntityTarget, In } from "typeorm";
import {
    Archive,
    ArchiveChunk,
    Chunk,
    Datastore,
    FileArchive,
    Group,
    ImageArchive,
    Namespace,
    Snapshot,
    SSHConnection,
    StatisticsEmbedding,
} from "@pbs-manager/database-schema";
import { archiveToFilePath, Indices, parseRemoteIndexFilesWithSFTP } from "@pbs-manager/data-sync";
import { DatastoreService } from "../datastore/datastore.service";
import { useSFTPConnection } from "../ssh-utils";
import { FindOptionsWhere } from "typeorm/find-options/FindOptionsWhere";

function* partitionArray<T>(arr: T[], size: number): Generator<T[]> {
    for (let i = 0; i < arr.length; i += size) {
        yield arr.slice(i, i + size);
    }
}

@Injectable()
export class ArchiveService {
    private readonly logger: Logger = new Logger(ArchiveService.name);

    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly datastoreService: DatastoreService
    ) {
        // setTimeout(() => this.parseMissingArchiveIndexes(1, 1000), 5000);
        // setTimeout(() => this.updateStatistics(1, false), 3000);
    }

    async updateStatistics(
        datastoreId: number,
        markChunks: boolean = false,
        includeMissingChunks: boolean = false
    ): Promise<void> {
        this.logger.log(`Starting statistics update for datastore ID ${datastoreId}`);
        try {
            await this.dataSource.transaction(async (transactionalEntityManager: EntityManager): Promise<void> => {
                const now: number = Date.now();
                const baseStatistics: StatisticsEmbedding = {
                    uniqueSizeBytes: 0,
                    logicalSizeBytes: 0,
                    deduplicationRatio: null,
                    calculatedAt: new Date(now),
                };
                // Load the Datastore with pessimistic locking
                this.logger.verbose(
                    `Loading datastore ID ${datastoreId} for statistics update with pessimistic locking`
                );
                const datastore: Datastore = await transactionalEntityManager.findOne(Datastore, {
                    where: { id: datastoreId },
                    lock: { mode: "pessimistic_write" },
                });
                if (!datastore) {
                    throw new Error(`Datastore with ID ${datastoreId} not found for statistics update`);
                }
                this.logger.verbose(`Loaded datastore ID ${datastoreId} for statistics update`);
                // Default the statistics to 0 for the datastore to ensure we have a baseline for the update
                datastore.statistics = { ...baseStatistics };
                // Load the namespaces related to the datastore with pessimistic locking
                this.logger.verbose(
                    `Loading namespaces for datastore ID ${datastoreId} with pessimistic locking for statistics update`
                );
                const namespaces: Namespace[] = await transactionalEntityManager.find(Namespace, {
                    where: { datastoreId },
                    lock: { mode: "pessimistic_write" },
                });
                const namespaceMap: Map<number, Namespace> = new Map(
                    namespaces.map(namespace => [namespace.id, namespace])
                );
                this.logger.verbose(`Loaded ${namespaces.length} namespace(s) for statistics update`);
                // Default the statistics for all related namespaces to 0 to ensure we have a baseline for the update
                for (const namespace of namespaces) {
                    namespace.statistics = { ...baseStatistics };
                }
                // Load the groups related to the datastore with pessimistic locking
                this.logger.verbose(
                    `Loading groups for datastore ID ${datastoreId} with pessimistic locking for statistics update`
                );
                const groups: Group[] = await transactionalEntityManager.find(Group, {
                    where: { datastoreId },
                    lock: { mode: "pessimistic_write" },
                });
                const groupMap: Map<number, Group> = new Map(groups.map(group => [group.id, group]));
                const groupIds: Set<number> = new Set(groups.map(group => group.id));
                this.logger.verbose(`Loaded ${groups.length} group(s) for statistics update`);
                // Default the statistics for all related groups to 0 to ensure we have a baseline for the update
                for (const group of groups) {
                    group.statistics = { ...baseStatistics };
                }
                // Load the snapshots related to the datastore with pessimistic locking
                this.logger.verbose(
                    `Loading snapshots for datastore ID ${datastoreId} with pessimistic locking for statistics update`
                );
                const snapshots: Snapshot[] = await transactionalEntityManager.find(Snapshot, {
                    where: { groupId: In(Array.from(groupIds)), datastoreId },
                    lock: { mode: "pessimistic_write" },
                });
                const snapshotMap: Map<number, Snapshot> = new Map(snapshots.map(snapshot => [snapshot.id, snapshot]));
                const snapshotIds: Set<number> = new Set(snapshots.map(snapshot => snapshot.id));
                this.logger.verbose(`Loaded ${snapshots.length} snapshot(s) for statistics update`);
                // Default the statistics for all related snapshots to 0 to ensure we have a baseline for the update
                for (const snapshot of snapshots) {
                    snapshot.statistics = { ...baseStatistics };
                }
                // Load the archives related to the datastore with pessimistic locking, filtering by parsed indices and missing chunks based on the provided parameter to ensure we only process relevant archives
                const findOptionsWhere: FindOptionsWhere<Archive> = {
                    datastoreId,
                    snapshotId: In(Array.from(snapshotIds)),
                    isIndexParsed: true,
                    isMissingChunks: includeMissingChunks ? undefined : false,
                };
                // Load the FileArchives and ImageArchives separately to properly type them, but we will process them together since they share the same ArchiveChunk relations and we want to calculate statistics across all archives for the datastore
                this.logger.verbose(
                    `Loading FileArchives and ImageArchives with parsed indices and missing chunk status ${includeMissingChunks} for datastore ID ${datastoreId} with pessimistic locking for statistics update`
                );
                const fileArchives: FileArchive[] = await transactionalEntityManager.find(FileArchive, {
                    where: findOptionsWhere as FindOptionsWhere<FileArchive>[],
                    lock: { mode: "pessimistic_write" },
                });
                const imageArchives: ImageArchive[] = await transactionalEntityManager.find(ImageArchive, {
                    where: findOptionsWhere as FindOptionsWhere<ImageArchive>[],
                    lock: { mode: "pessimistic_write" },
                });
                const archives: Archive[] = [...fileArchives, ...imageArchives];
                const archiveMap: Map<number, Archive> = new Map(
                    [...fileArchives, ...imageArchives].map(archive => [archive.id, archive])
                );
                const archiveIds: Set<number> = new Set(archiveMap.keys());
                this.logger.verbose(
                    `Loaded ${fileArchives.length} FileArchive(s) and ${imageArchives.length} ImageArchive(s) with parsed indices and missing chunk status ${includeMissingChunks} for datastore ID ${datastoreId}`
                );
                // Default the statistics for all related archives to 0 to ensure we have a baseline for the update
                for (const archive of archives) {
                    archive.statistics = { ...baseStatistics };
                }
                // Load the ArchiveChunk relations for the identified Archives with pessimistic locking to prevent concurrent modifications during statistics calculation
                this.logger.verbose(
                    `Loading existing archive-chunk relations for ${archiveIds.size} unique archive ID(s) for datastore ID ${datastoreId}`
                );
                const archiveChunks: {
                    archiveId: number;
                    chunkId: number;
                    count: number;
                    sizeBytes: number;
                }[] = (
                    await transactionalEntityManager
                        .createQueryBuilder(ArchiveChunk, "ac")
                        .leftJoin(Chunk, "c", "c.id = ac.chunk_id")
                        .select(["ac.archive_id", "ac.chunk_id", "ac.count", "c.size_bytes"])
                        .where("ac.archive_id IN (:...archiveIds)", { archiveIds: Array.from(archiveIds) })
                        // .setLock("pessimistic_read") // QueryFailedError: FOR SHARE cannot be applied to the nullable side of an outer join
                        .getRawMany()
                ).map(row => ({
                    archiveId: row["archive_id"],
                    chunkId: row["chunk_id"],
                    count: row["ac_count"],
                    sizeBytes: Number(row["size_bytes"] || 0),
                }));
                const archiveChunksByArchiveId: Map<number, ArchiveChunk[]> = new Map();
                for (const archiveChunk of archiveChunks) {
                    if (!archiveChunksByArchiveId.has(archiveChunk.archiveId)) {
                        archiveChunksByArchiveId.set(archiveChunk.archiveId, []);
                    }
                    archiveChunksByArchiveId.get(archiveChunk.archiveId).push(archiveChunk);
                }
                const chunkSizeById: Map<number, number> = new Map();
                for (const archiveChunk of archiveChunks) {
                    chunkSizeById.set(archiveChunk.chunkId, archiveChunk.sizeBytes);
                }
                this.logger.verbose(
                    `Loaded ${archiveChunks.length} existing archive-chunk relation(s) for datastore ID ${datastoreId}`
                );
                // Find unique chunk ids across the entities
                const chunkCountsByChunkId: Map<number, number> = new Map();
                const chunkCountsByChunkIdByNamespaceId: Map<number, Map<number, number>> = new Map();
                const chunkCountsByChunkIdByGroupId: Map<number, Map<number, number>> = new Map();
                const chunkCountsByChunkIdBySnapshotId: Map<number, Map<number, number>> = new Map();
                const chunkCountsByChunkIdByArchiveId: Map<number, Map<number, number>> = new Map();
                function addChunkCount(
                    map: Map<number, Map<number, number>>,
                    id: number,
                    chunkId: number,
                    count: number = 1
                ): void {
                    if (!map.has(id)) {
                        map.set(id, new Map());
                    }
                    const chunkCountById: Map<number, number> = map.get(id);
                    chunkCountById.set(chunkId, (chunkCountById.get(chunkId) ?? 0) + count);
                }
                function addChunkCountToNamespace(
                    namespaceId: number | undefined,
                    chunkId: number,
                    count: number = 1
                ): void {
                    let currentNamespaceId: number | undefined = namespaceId;
                    while (currentNamespaceId != null) {
                        addChunkCount(chunkCountsByChunkIdByNamespaceId, namespaceId, chunkId, count);
                        const currentNamespace: Namespace | undefined = namespaceMap.get(currentNamespaceId);
                        if (!currentNamespace) {
                            throw new Error(
                                `Namespace with ID ${currentNamespaceId} not found in namespace map during statistics update`
                            );
                        }
                        currentNamespaceId = currentNamespace.parentId;
                    }
                }
                for (const archiveChunk of archiveChunks) {
                    const { archiveId, chunkId, count } = archiveChunk;
                    chunkCountsByChunkId.set(chunkId, (chunkCountsByChunkId.get(chunkId) ?? 0) + count);
                    const archive: Archive | undefined = archiveMap.get(archiveId);
                    if (!archive) {
                        throw new Error(
                            `Archive with ID ${archiveId} not found in archive map during statistics update`
                        );
                    }
                    addChunkCount(chunkCountsByChunkIdByArchiveId, archiveId, chunkId, count);
                    const snapshotId: number = archive.snapshotId;
                    const snapshot: Snapshot | undefined = snapshotMap.get(snapshotId);
                    if (!snapshot) {
                        throw new Error(
                            `Snapshot with ID ${snapshotId} not found in snapshot map during statistics update for archive ID ${archiveId}`
                        );
                    }
                    addChunkCount(chunkCountsByChunkIdBySnapshotId, snapshotId, chunkId, count);
                    const groupId: number = snapshot.groupId;
                    const group: Group | undefined = groupMap.get(groupId);
                    if (!group) {
                        throw new Error(
                            `Group with ID ${groupId} not found in group map during statistics update for archive ID ${archiveId}`
                        );
                    }
                    addChunkCount(chunkCountsByChunkIdByGroupId, groupId, chunkId, count);
                    addChunkCountToNamespace(group.namespaceId, chunkId, count);
                }
                // Calculate statistics across the Archives, Snapshots, Groups, Namespaces, and Datastore based on the loaded data and the relationships between them
                function calculateStatistics(
                    entity: { statistics: StatisticsEmbedding },
                    chunkCountsByChunkId: Map<number, number>
                ): void {
                    for (const [chunkId, count] of chunkCountsByChunkId) {
                        const chunkSizeBytes: number = chunkSizeById.get(chunkId) ?? 0;
                        entity.statistics.uniqueSizeBytes += chunkSizeBytes;
                        entity.statistics.logicalSizeBytes += chunkSizeBytes * count;
                        entity.statistics.deduplicationRatio =
                            entity.statistics.uniqueSizeBytes && entity.statistics.logicalSizeBytes !== null
                                ? entity.statistics.logicalSizeBytes / entity.statistics.uniqueSizeBytes
                                : null;
                    }
                }
                function calculateStatisticsDeep<Entity extends { statistics: StatisticsEmbedding }>(
                    entityClass: EntityTarget<Entity>,
                    entityMap: Map<number, Entity>,
                    chunkCountsByChunkIdByEntityId: Map<number, Map<number, number>>
                ): void {
                    for (const [entityId, chunkCounts] of chunkCountsByChunkIdByEntityId) {
                        const entity: Entity | undefined = entityMap.get(entityId);
                        if (!entity) {
                            throw new Error(`Could not find ${String(entityClass)} with ID ${entityId} in map`);
                        }
                        calculateStatistics(entity, chunkCounts);
                    }
                }
                // // Datastore
                this.logger.verbose(`Calculating statistics for Datastore with ID ${datastoreId}`);
                calculateStatistics(datastore, chunkCountsByChunkId);
                // // Namespaces
                this.logger.verbose(`Calculating statistics for ${namespaceMap.size} Namespace(s)`);
                calculateStatisticsDeep(Namespace, namespaceMap, chunkCountsByChunkIdByNamespaceId);
                // // Groups
                this.logger.verbose(`Calculating statistics for ${groupMap.size} Groups(s)`);
                calculateStatisticsDeep(Group, groupMap, chunkCountsByChunkIdByGroupId);
                // // Snapshots
                this.logger.verbose(`Calculating statistics for ${snapshotMap.size} Snapshot(s)`);
                calculateStatisticsDeep(Snapshot, snapshotMap, chunkCountsByChunkIdBySnapshotId);
                // // Archives
                this.logger.verbose(`Calculating statistics for ${archiveMap.size} Archives(s)`);
                calculateStatisticsDeep(Archive, archiveMap, chunkCountsByChunkIdByArchiveId);
                // Save the updated statistics for the Archives, Snapshots, Groups, Namespaces, and Datastore in a single transaction to ensure consistency
                this.logger.verbose(
                    `Saving updated statistics for Datastore, Namespaces, Groups, Snapshots, and Archives for datastore ID ${datastoreId}`
                );
                await transactionalEntityManager.save(
                    [datastore, ...namespaces, ...groups, ...snapshots, ...archives],
                    { chunk: 1000 }
                );
                this.logger.verbose(
                    `Saved statistics for Datastore, ${namespaces.length} Namespaces, ${groups.length} Groups, ${snapshots.length} Snapshots, and ${archives.length} Archives`
                );
                if (markChunks) {
                    // Update Chunks
                    // // Mark all chunks in the datastore as unused first
                    this.logger.verbose(
                        `Marking all chunks in datastore ID ${datastoreId} as unused before updating based on identified Archives`
                    );
                    await transactionalEntityManager
                        .createQueryBuilder(Chunk, "c")
                        .update()
                        .set({ unused: true })
                        .where("datastore_id = :datastoreId", { datastoreId })
                        .execute();
                    this.logger.verbose(
                        `Marked all chunks in datastore ID ${datastoreId} as unused, now marking chunks related to identified Archives as not unused`
                    );
                    // // Then mark the chunks that are still in use based on the identified Archives as not unused
                    this.logger.verbose(
                        `Marking ${chunkCountsByChunkId.size} unique chunk ID(s) as not unused based on identified Archives for datastore ID ${datastoreId}`
                    );
                    const usedChunkIds: number[] = Array.from(chunkCountsByChunkId.keys());
                    for (const chunkIdBatch of partitionArray(usedChunkIds, 10000)) {
                        await transactionalEntityManager
                            .createQueryBuilder(Chunk, "c")
                            .update()
                            .set({ unused: false })
                            .whereInIds(chunkIdBatch)
                            .execute();
                    }
                    this.logger.verbose(
                        `Marked ${chunkCountsByChunkId.size} unique chunk ID(s) as not unused based on identified Archives for datastore ID ${datastoreId}`
                    );
                }
            });
        } catch (error) {
            this.logger.error(`Error during statistics update for datastore ID ${datastoreId}`, error);
            throw error;
        } finally {
            this.logger.log(`Completed statistics update for datastore ID ${datastoreId}`);
        }
    }

    async parseMissingArchiveIndexes(
        datastoreId: number,
        limit: number = 1000,
        sshConnection?: SSHConnection,
        includeMissingChunks: boolean = false
    ): Promise<void> {
        this.logger.log(`Starting archive index parsing for datastore ID ${datastoreId}`);
        try {
            await this.dataSource.transaction(async (transactionalEntityManager: EntityManager): Promise<void> => {
                // Load unparsed file archives with pessimistic locking to prevent concurrent processing
                const fileArchives: FileArchive[] = await transactionalEntityManager.find(FileArchive, {
                    where: !includeMissingChunks
                        ? { isIndexParsed: false, datastoreId }
                        : [
                              { isIndexParsed: false, datastoreId },
                              { isMissingChunks: true, datastoreId },
                          ],
                    order: { metadata: { creation: "DESC" } },
                    lock: { mode: "pessimistic_write" },
                    take: limit,
                });
                this.logger.debug(`Found ${fileArchives.length} unparsed file archive(s)`);
                // Load unparsed image archives with pessimistic locking to prevent concurrent processing
                const imageArchives: ImageArchive[] = await transactionalEntityManager.find(ImageArchive, {
                    where: !includeMissingChunks
                        ? { isIndexParsed: false, datastoreId }
                        : [
                              { isIndexParsed: false, datastoreId },
                              { isIndexParsed: true, datastoreId },
                          ],
                    order: { metadata: { creation: "DESC" } },
                    lock: { mode: "pessimistic_write" },
                    take: limit,
                });
                this.logger.debug(`Found ${imageArchives.length} unparsed image archive(s)`);
                if (fileArchives.length === 0 && imageArchives.length === 0) {
                    this.logger.log(
                        `No unparsed archives found for datastore ID ${datastoreId}, skipping index parsing`
                    );
                    return;
                }
                // Load snapshots related to the file archives with pessimistic locking
                const snapshotIds: Set<number> = new Set([
                    ...fileArchives.map(archive => archive.snapshotId),
                    ...imageArchives.map(archive => archive.snapshotId),
                ]);
                const snapshots: Snapshot[] = await transactionalEntityManager.find(Snapshot, {
                    where: { id: In(Array.from(snapshotIds)) },
                    lock: { mode: "pessimistic_read" },
                });
                const snapshotMap: Map<number, Snapshot> = new Map(snapshots.map(snapshot => [snapshot.id, snapshot]));
                this.logger.verbose(`Loaded ${snapshots.length} snapshot(s) for archive parsing`);
                // Load groups related to the snapshots with pessimistic locking
                const groupIds: Set<number> = new Set(snapshots.map(snapshot => snapshot.groupId));
                const groups: Group[] = await transactionalEntityManager.find(Group, {
                    where: { id: In(Array.from(groupIds)) },
                    lock: { mode: "pessimistic_read" },
                });
                const groupMap: Map<number, Group> = new Map(groups.map(group => [group.id, group]));
                this.logger.verbose(`Loaded ${groups.length} group(s) for archive parsing`);
                // Load namespaces related to the groups with pessimistic locking
                const namespaceIds: Set<number> = new Set(
                    groups.map(group => group.namespaceId).filter(id => id != null)
                );
                const namespaces: Namespace[] =
                    namespaceIds.size === 0
                        ? []
                        : await transactionalEntityManager.find(Namespace, {
                              where: { id: In(Array.from(namespaceIds)) },
                              lock: { mode: "pessimistic_read" },
                          });
                const namespaceMap: Map<number, Namespace> = new Map(
                    namespaces.map(namespace => [namespace.id, namespace])
                );
                this.logger.verbose(`Loaded ${namespaces.length} namespace(s) for archive parsing`);
                // Load datastores related to the namespaces with pessimistic locking
                const datastoreIds: Set<number> = new Set(groups.map(group => group.datastoreId));
                const datastores: Datastore[] = await transactionalEntityManager.find(Datastore, {
                    where: { id: In(Array.from(datastoreIds)) },
                    lock: { mode: "pessimistic_read" },
                });
                const datastoreMap: Map<number, Datastore> = new Map(
                    datastores.map(datastore => [datastore.id, datastore])
                );
                this.logger.verbose(`Loaded ${datastores.length} datastore(s) for archive parsing`);
                // Build index file paths for the archives based on the loaded data
                const fileArchiveByPath: Map<string, FileArchive> = new Map(
                    fileArchives.map(archive => [
                        archiveToFilePath(archive, datastoreMap, namespaceMap, groupMap, snapshotMap),
                        archive,
                    ])
                );
                const imageArchiveByPath: Map<string, ImageArchive> = new Map(
                    imageArchives.map(archive => [
                        archiveToFilePath(archive, datastoreMap, namespaceMap, groupMap, snapshotMap),
                        archive,
                    ])
                );
                const indexFilePaths: string[] = Array.from(
                    new Set([...fileArchiveByPath.keys(), ...imageArchiveByPath.keys()])
                );
                indexFilePaths.sort(); // Ensure consistent processing order
                if (!sshConnection) {
                    this.logger.verbose(
                        `No SSH connection provided, attempting to load active connection for datastore ID ${datastoreId}`
                    );
                    sshConnection = await this.datastoreService.getActiveSSHConnection(datastoreId);
                    if (!sshConnection) {
                        this.logger.error(`No active SSH connection found for datastore ID ${datastoreId}`);
                        return;
                    }
                    this.logger.verbose(
                        `Loaded active SSH connection with ID ${sshConnection.id} for datastore ID ${datastoreId}`
                    );
                }
                this.logger.verbose(
                    `Processing ${indexFilePaths.length} archive index file(s) for datastore ID ${datastoreId}`
                );
                const { dynamic, fixed }: Indices = await useSFTPConnection(
                    transactionalEntityManager,
                    sshConnection,
                    sftp => parseRemoteIndexFilesWithSFTP(sftp, indexFilePaths)
                );
                this.logger.verbose(
                    `Parsed ${dynamic.length} dynamic index entry(ies) and ${fixed.length} fixed index entry(ies) for datastore ID ${datastoreId}`
                );
                // Determine missing index files
                const fileArchivesToDeleteMap: Map<string, FileArchive> = new Map(fileArchiveByPath);
                const imageArchivesToDeleteMap: Map<string, ImageArchive> = new Map(imageArchiveByPath);
                for (const dynamicIndex of dynamic) {
                    fileArchivesToDeleteMap.delete(dynamicIndex.path);
                }
                for (const fixedIndex of fixed) {
                    imageArchivesToDeleteMap.delete(fixedIndex.path);
                }
                const fileArchivesToDelete: FileArchive[] = Array.from(fileArchivesToDeleteMap.values());
                const imageArchivesToDelete: ImageArchive[] = Array.from(imageArchivesToDeleteMap.values());
                if (fileArchivesToDelete.length > 0 || imageArchivesToDelete.length > 0) {
                    this.logger.verbose(
                        `Marking ${fileArchivesToDelete.length} FileArchive(s) and ${imageArchivesToDelete.length} ImageArchive(s) for deletion due to missing index files`
                    );
                    await transactionalEntityManager.softRemove([...fileArchivesToDelete, ...imageArchivesToDelete], {
                        chunk: 1000,
                    });
                }
                // Collect Chunk digests from the parsed indices for later processing (e.g., linking to Archives)
                const chunkDigests: Set<string> = new Set();
                for (const dynamicIndex of dynamic) {
                    if (dynamicIndex.digests) {
                        for (const digest of dynamicIndex.digests) {
                            chunkDigests.add(digest);
                        }
                    }
                }
                for (const fixedIndex of fixed) {
                    if (fixedIndex.digests) {
                        for (const digest of fixedIndex.digests) {
                            chunkDigests.add(digest);
                        }
                    }
                }
                // Load existing Chunks based on the collected digests with pessimistic locking to prevent concurrent processing
                if (chunkDigests.size === 0) {
                    this.logger.warn(
                        `No chunk digests found in parsed indices for datastore ID ${datastoreId}, skipping chunk loading and archive-chunk relation processing`
                    );
                } else {
                    this.logger.verbose(
                        `Loading existing chunk ids for ${chunkDigests.size} unique digest(s) for datastore ID ${datastoreId}`
                    );
                }
                const chunks: { id: number; hash_sha256: string }[] = [];
                for (const digestBatch of partitionArray(Array.from(chunkDigests), 10000)) {
                    chunks.push(
                        ...(await transactionalEntityManager
                            .createQueryBuilder(Chunk, "chunk")
                            .select(["id", "hash_sha256"])
                            .where("datastore_id = :datastoreId", { datastoreId })
                            .andWhere("hash_sha256 IN (:...digests)", { digests: Array.from(digestBatch) })
                            .setLock("pessimistic_read")
                            .getRawMany())
                    );
                }
                const chunkIdByDigest: Map<string, number> = new Map(
                    chunks.map(chunk => [chunk.hash_sha256, chunk.id])
                );
                this.logger.verbose(
                    `Loaded ${chunks.length} existing chunk id(s) based on parsed indices for datastore ID ${datastoreId}`
                );
                // Collect Archive IDs
                const archiveIds: Set<number> = new Set([
                    ...fileArchives.map(archive => archive.id),
                    ...imageArchives.map(archive => archive.id),
                ]);
                // Load existing ArchiveChunks
                this.logger.verbose(
                    `Loading existing archive-chunk relations for ${archiveIds.size} unique archive ID(s) for datastore ID ${datastoreId}`
                );
                const archiveChunks: ArchiveChunk[] = await transactionalEntityManager.find(ArchiveChunk, {
                    where: { archiveId: In(Array.from(archiveIds)) },
                    lock: { mode: "pessimistic_write" },
                });
                const archiveChunksByArchiveId: Map<number, ArchiveChunk[]> = new Map();
                for (const archiveChunk of archiveChunks) {
                    if (!archiveChunksByArchiveId.has(archiveChunk.archiveId)) {
                        archiveChunksByArchiveId.set(archiveChunk.archiveId, []);
                    }
                    archiveChunksByArchiveId.get(archiveChunk.archiveId).push(archiveChunk);
                }
                this.logger.verbose(
                    `Loaded ${archiveChunks.length} existing archive-chunk relation(s) for datastore ID ${datastoreId}`
                );
                // Process dynamic indices and update corresponding FileArchives as needed
                this.logger.verbose(
                    `Processing dynamic indices and preparing FileArchives for update for datastore ID ${datastoreId}`
                );
                const fileArchivesToUpdate: FileArchive[] = [];
                for (const dynamicIndex of dynamic) {
                    const fileArchive: FileArchive | undefined = fileArchiveByPath.get(dynamicIndex.path);
                    if (!fileArchive) {
                        this.logger.warn(
                            `No matching FileArchive found for dynamic index path ${dynamicIndex.path}, skipping`
                        );
                        continue;
                    }
                    let hasChanges: boolean = false;
                    if (fileArchive.uuid !== dynamicIndex.uuid) {
                        fileArchive.uuid = dynamicIndex.uuid ?? null;
                        hasChanges = true;
                    }
                    if (fileArchive.creation?.getTime() !== dynamicIndex.creation?.getTime()) {
                        fileArchive.creation = dynamicIndex.creation ?? null;
                        hasChanges = true;
                    }
                    if (fileArchive.indexHashSHA256 !== dynamicIndex.checksum) {
                        fileArchive.indexHashSHA256 = dynamicIndex.checksum ?? null;
                        hasChanges = true;
                    }
                    if (!fileArchive.isIndexParsed) {
                        fileArchive.isIndexParsed = true;
                        // Default to not having missing chunks when we have a parsed index
                        fileArchive.isMissingChunks = false;
                        hasChanges = true;
                    }
                    if (hasChanges) {
                        fileArchivesToUpdate.push(fileArchive);
                    }
                }
                this.logger.debug(
                    `Prepared ${fileArchivesToUpdate.length} FileArchive(s) for update based on dynamic indices`
                );
                // Process fixed indices as needed and update corresponding ImageArchives as needed
                this.logger.verbose(
                    `Processing fixed indices and preparing ImageArchives for update for datastore ID ${datastoreId}`
                );
                const imageArchivesToUpdate: ImageArchive[] = [];
                for (const fixedIndex of fixed) {
                    const imageArchive: ImageArchive | undefined = imageArchiveByPath.get(fixedIndex.path);
                    if (!imageArchive) {
                        this.logger.warn(
                            `No matching ImageArchive found for fixed index path ${fixedIndex.path}, skipping`
                        );
                        continue;
                    }
                    let hasChanges: boolean = false;
                    if (imageArchive.uuid !== fixedIndex.uuid) {
                        imageArchive.uuid = fixedIndex.uuid ?? null;
                        hasChanges = true;
                    }
                    if (imageArchive.creation?.getTime() !== fixedIndex.creation?.getTime()) {
                        imageArchive.creation = fixedIndex.creation ?? null;
                        hasChanges = true;
                    }
                    if (imageArchive.indexHashSHA256 !== fixedIndex.checksum) {
                        imageArchive.indexHashSHA256 = fixedIndex.checksum ?? null;
                        hasChanges = true;
                    }
                    if (imageArchive.sizeBytes !== fixedIndex.sizeBytes) {
                        imageArchive.sizeBytes = fixedIndex.sizeBytes ?? null;
                        hasChanges = true;
                    }
                    if (imageArchive.chunkSizeBytes !== fixedIndex.chunkSizeBytes) {
                        imageArchive.chunkSizeBytes = fixedIndex.chunkSizeBytes ?? null;
                        hasChanges = true;
                    }
                    if (!imageArchive.isIndexParsed) {
                        imageArchive.isIndexParsed = true;
                        // Default to not having missing chunks when we have a parsed index
                        imageArchive.isMissingChunks = false;
                        hasChanges = true;
                    }
                    if (hasChanges) {
                        imageArchivesToUpdate.push(imageArchive);
                    }
                }
                this.logger.debug(
                    `Prepared ${imageArchivesToUpdate.length} ImageArchive(s) for update based on fixed indices`
                );
                await transactionalEntityManager.save([...fileArchivesToUpdate, ...imageArchivesToUpdate], {
                    chunk: 1000,
                });
                // Process digests from dynamic and fixed indices and create ArchiveChunk relations as needed
                this.logger.verbose(
                    `Processing chunk digests from parsed indices and preparing ArchiveChunk relations for update for datastore ID ${datastoreId}`
                );
                // Clear the update arrays to reuse them
                fileArchivesToUpdate.length = 0;
                imageArchivesToUpdate.length = 0;
                const archiveChunksToInsert: ArchiveChunk[] = [];
                const archiveChunksToUpdate: ArchiveChunk[] = [];
                const archiveChunksToDelete: ArchiveChunk[] = [...archiveChunks];
                for (const index of [...dynamic, ...fixed]) {
                    if (!index.digests) {
                        continue;
                    }
                    const isFileArchive: boolean = fileArchiveByPath.has(index.path);
                    const archive: FileArchive | ImageArchive | undefined = isFileArchive
                        ? fileArchiveByPath.get(index.path)
                        : imageArchiveByPath.get(index.path);
                    const archiveId: number = archive.id;
                    // Process digests and count occurrences for the current index
                    const chunkCountById: Map<number, number> = new Map();
                    for (const digest of index.digests) {
                        const chunkId: number | undefined = chunkIdByDigest.get(digest);
                        if (!chunkId) {
                            //TODO What about the digests that don't have matching Chunks in the database?
                            // Should we create new Chunk entries for them?
                            // For now, we just skip linking those digests to the archive.
                            // this.logger.warn(
                            //     `No matching Chunk found for digest ${digest} in index path ${index.path}, skipping relation`
                            // );
                            // Mark the archive as having missing chunks so we can easily find and reprocess it later once the missing chunks are added to the database
                            archive.isMissingChunks = true;
                            if (isFileArchive) {
                                if (!fileArchivesToUpdate.some(a => a.id === archive.id)) {
                                    fileArchivesToUpdate.push(archive as FileArchive);
                                }
                            } else {
                                if (!imageArchivesToUpdate.some(a => a.id === archive.id)) {
                                    imageArchivesToUpdate.push(archive as ImageArchive);
                                }
                            }
                            continue;
                        }
                        chunkCountById.set(chunkId, (chunkCountById.get(chunkId) ?? 0) + 1);
                    }
                    const existingArchiveChunks: ArchiveChunk[] = archiveChunksByArchiveId.get(archiveId) ?? [];
                    const existingArchiveChunksByChunkId: Map<number, ArchiveChunk> = new Map(
                        existingArchiveChunks.map(ac => [ac.chunkId, ac])
                    );
                    for (const [chunkId, count] of chunkCountById.entries()) {
                        const existingArchiveChunk: ArchiveChunk | undefined =
                            existingArchiveChunksByChunkId.get(chunkId);
                        if (existingArchiveChunk) {
                            if (existingArchiveChunk.count !== count) {
                                // If the count has changed, we need to update the existing relation
                                existingArchiveChunk.count = count;
                                archiveChunksToUpdate.push(existingArchiveChunk);
                            }
                            // Since this relation is still valid, we remove it from the delete list
                            const deleteIndex: number = archiveChunksToDelete.findIndex(
                                ac =>
                                    ac.archiveId === existingArchiveChunk.archiveId &&
                                    ac.chunkId === existingArchiveChunk.chunkId
                            );
                            if (deleteIndex !== -1) {
                                archiveChunksToDelete.splice(deleteIndex, 1);
                            }
                        } else if (!existingArchiveChunk) {
                            // If the relation doesn't exist, we need to create a new one
                            const newArchiveChunk: ArchiveChunk = transactionalEntityManager.create(ArchiveChunk, {
                                archiveId,
                                chunkId,
                                count,
                            });
                            archiveChunksToInsert.push(newArchiveChunk);
                        }
                    }
                }
                if (fileArchivesToUpdate.length > 0 || imageArchivesToUpdate.length > 0) {
                    this.logger.verbose(
                        `Prepared ${fileArchivesToUpdate.length} FileArchive(s) and ${imageArchivesToUpdate.length} ImageArchive(s) for update based on chunk digest processing`
                    );
                    await transactionalEntityManager.save([...fileArchivesToUpdate, ...imageArchivesToUpdate], {
                        chunk: 1000,
                    });
                }
                this.logger.debug(
                    `Prepared ${archiveChunksToInsert.length} new ArchiveChunk relation(s) for insertion, ${archiveChunksToUpdate.length} existing relation(s) for update, and ${archiveChunksToDelete.length} existing relation(s) for deletion based on parsed indices for datastore ID ${datastoreId}`
                );
                for (const archiveChunkBatch of partitionArray(archiveChunksToInsert, 1000)) {
                    await transactionalEntityManager.insert(ArchiveChunk, archiveChunkBatch);
                }
                for (const archiveChunkBatch of partitionArray(archiveChunksToUpdate, 1000)) {
                    await transactionalEntityManager.upsert(ArchiveChunk, archiveChunkBatch, {
                        conflictPaths: ["archiveId", "chunkId"],
                        upsertType: "on-conflict-do-update",
                    });
                }
                await transactionalEntityManager.remove(ArchiveChunk, archiveChunksToDelete, { chunk: 1000 });
            });
        } catch (error) {
            this.logger.error(`Error during archive index parsing for datastore ID ${datastoreId}`, error);
            throw error;
        } finally {
            this.logger.log(`Completed archive index parsing for datastore ID ${datastoreId}`);
        }
    }
}
