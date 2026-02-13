import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager, In } from "typeorm";
import {
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

    async parseMissingArchiveIndexes(datastoreId: number, sshConnection?: SSHConnection): Promise<void> {
        this.logger.log(`Starting archive index parsing for datastore ID ${datastoreId}`);
        try {
            await this.dataSource.transaction(async (transactionalEntityManager: EntityManager): Promise<void> => {
                // Load unparsed file archives with pessimistic locking to prevent concurrent processing
                const fileArchives: FileArchive[] = await transactionalEntityManager.find(FileArchive, {
                    where: { indexParsed: false, datastoreId },
                    lock: { mode: "pessimistic_write" },
                    take: 10, //TODO Remove this limit after testing
                });
                this.logger.debug(`Found ${fileArchives.length} unparsed file archive(s)`);
                // Load unparsed image archives with pessimistic locking to prevent concurrent processing
                const imageArchives: ImageArchive[] = await transactionalEntityManager.find(ImageArchive, {
                    where: { indexParsed: false, datastoreId },
                    lock: { mode: "pessimistic_write" },
                    take: 10, //TODO Remove this limit after testing
                });
                this.logger.debug(`Found ${imageArchives.length} unparsed image archive(s)`);
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
                const namespaces: Namespace[] = await transactionalEntityManager.find(Namespace, {
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
                // Process dynamic indices and update corresponding FileArchives as needed
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
                    //TODO Process digests (link Chunks to Archives)
                }
                this.logger.debug(
                    `Prepared ${fileArchivesToUpdate.length} FileArchive(s) for update based on dynamic indices`
                );
                // Process fixed indices as needed and update corresponding ImageArchives as needed
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
                    if (!imageArchive.indexParsed) {
                        imageArchive.indexParsed = true;
                        hasChanges = true;
                    }
                    if (hasChanges) {
                        imageArchivesToUpdate.push(imageArchive);
                    }
                    //TODO Process digests (link Chunks to Archives)
                }
                this.logger.debug(
                    `Prepared ${imageArchivesToUpdate.length} ImageArchive(s) for update based on fixed indices`
                );
                await transactionalEntityManager.save([...fileArchivesToUpdate, ...imageArchivesToUpdate]);
            });
            this.logger.log(`Completed archive index parsing for datastore ID ${datastoreId}`);
        } catch (error) {
            this.logger.error(`Error during archive index parsing for datastore ID ${datastoreId}`, error);
            throw error;
        }
    }
}
