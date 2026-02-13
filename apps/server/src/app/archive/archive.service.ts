import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager, In } from "typeorm";
import {
    ArchiveChunk,
    Chunk,
    Datastore,
    FileArchive,
    Group,
    ImageArchive,
    Namespace,
    Snapshot,
    SSHConnection,
} from "@pbs-manager/database-schema";
import { archiveToFilePath, Indices, parseRemoteIndexFilesWithSFTP } from "@pbs-manager/data-sync";
import { DatastoreService } from "../datastore/datastore.service";
import { useSFTPConnection } from "../ssh-utils";

@Injectable()
export class ArchiveService {
    private readonly logger: Logger = new Logger(ArchiveService.name);

    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly datastoreService: DatastoreService
    ) {
        setTimeout(() => this.parseMissingArchiveIndexes(1), 1000);
    }

    async parseMissingArchiveIndexes(
        datastoreId: number,
        limit: number = 1000,
        sshConnection?: SSHConnection
    ): Promise<void> {
        this.logger.log(`Starting archive index parsing for datastore ID ${datastoreId}`);
        try {
            await this.dataSource.transaction(async (transactionalEntityManager: EntityManager): Promise<void> => {
                // Load unparsed file archives with pessimistic locking to prevent concurrent processing
                const fileArchives: FileArchive[] = await transactionalEntityManager.find(FileArchive, {
                    where: { indexParsed: false, datastoreId },
                    lock: { mode: "pessimistic_write" },
                    take: limit,
                });
                this.logger.debug(`Found ${fileArchives.length} unparsed file archive(s)`);
                // Load unparsed image archives with pessimistic locking to prevent concurrent processing
                const imageArchives: ImageArchive[] = await transactionalEntityManager.find(ImageArchive, {
                    where: { indexParsed: false, datastoreId },
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
                this.logger.verbose(
                    `Loading existing chunk ids for ${chunkDigests.size} unique digest(s) for datastore ID ${datastoreId}`
                );
                const chunks: { id: number; hash_sha256: string }[] = await transactionalEntityManager
                    .createQueryBuilder(Chunk, "chunk")
                    .select(["id", "hash_sha256"])
                    .where("datastore_id = :datastoreId", { datastoreId })
                    .andWhere("hash_sha256 IN (:...digests)", { digests: Array.from(chunkDigests) }) //FIXME What if there are too many digests to load at once?
                    .setLock("pessimistic_read")
                    .getRawMany();
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
                    if (!fileArchive.indexParsed) {
                        fileArchive.indexParsed = true;
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
                    if (!imageArchive.indexParsed) {
                        imageArchive.indexParsed = true;
                        hasChanges = true;
                    }
                    if (hasChanges) {
                        imageArchivesToUpdate.push(imageArchive);
                    }
                }
                this.logger.debug(
                    `Prepared ${imageArchivesToUpdate.length} ImageArchive(s) for update based on fixed indices`
                );
                await transactionalEntityManager.save([...fileArchivesToUpdate, ...imageArchivesToUpdate]);
                // Process digests from dynamic and fixed indices and create ArchiveChunk relations as needed
                this.logger.verbose(
                    `Processing chunk digests from parsed indices and preparing ArchiveChunk relations for update for datastore ID ${datastoreId}`
                );
                const archiveChunksToInsert: ArchiveChunk[] = [];
                const archiveChunksToUpdate: ArchiveChunk[] = [];
                const archiveChunksToDelete: ArchiveChunk[] = [...archiveChunks];
                for (const index of [...dynamic, ...fixed]) {
                    if (!index.digests) {
                        continue;
                    }
                    // Process digests and count occurrences for the current index
                    const chunkCountById: Map<number, number> = new Map();
                    for (const digest of index.digests) {
                        const chunkId: number | undefined = chunkIdByDigest.get(digest);
                        if (!chunkId) {
                            //TODO What about the digests that don't have matching Chunks in the database?
                            // Should we create new Chunk entries for them?
                            // For now, we just skip linking those digests to the archive.
                            this.logger.warn(
                                `No matching Chunk found for digest ${digest} in index path ${index.path}, skipping relation`
                            );
                            continue;
                        }
                        chunkCountById.set(chunkId, (chunkCountById.get(chunkId) ?? 0) + 1);
                    }
                    const isFileArchive: boolean = fileArchiveByPath.has(index.path);
                    const archive: FileArchive | ImageArchive | undefined = isFileArchive
                        ? fileArchiveByPath.get(index.path)
                        : imageArchiveByPath.get(index.path);
                    const archiveId: number = archive.id;
                    const existingArchiveChunks: ArchiveChunk[] = archiveChunksByArchiveId.get(archiveId) ?? [];
                    for (const [chunkId, count] of chunkCountById.entries()) {
                        const existingArchiveChunk: ArchiveChunk | undefined = existingArchiveChunks.find(
                            ac => ac.chunkId === chunkId
                        );
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
                this.logger.debug(
                    `Prepared ${archiveChunksToInsert.length} new ArchiveChunk relation(s) for insertion, ${archiveChunksToUpdate.length} existing relation(s) for update, and ${archiveChunksToDelete.length} existing relation(s) for deletion based on parsed indices for datastore ID ${datastoreId}`
                );
                await transactionalEntityManager.save(ArchiveChunk, archiveChunksToInsert, { chunk: 1000 });
                // await transactionalEntityManager.insert(ArchiveChunk, archiveChunksToInsert);
                await transactionalEntityManager.upsert(ArchiveChunk, archiveChunksToUpdate, {
                    conflictPaths: ["archiveId", "chunkId"],
                    upsertType: "on-conflict-do-update",
                });
                await transactionalEntityManager.remove(ArchiveChunk, archiveChunksToDelete, { chunk: 1000 });
            });
            this.logger.log(`Completed archive index parsing for datastore ID ${datastoreId}`);
        } catch (error) {
            this.logger.error(`Error during archive index parsing for datastore ID ${datastoreId}`, error);
            throw error;
        }
    }
}
