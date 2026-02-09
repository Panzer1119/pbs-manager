import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { NodeSSH, SSHExecCommandResponse, SSHExecOptions } from "node-ssh";
import { buildChunkFileFindAndStatCommandArray, ChunkMetadata, parseChunkFilePathsAndSizes } from "./pbs-chunk";
import { DataSource, EntityManager, IsNull, UpdateResult } from "typeorm";
import { InjectDataSource } from "@nestjs/typeorm";
import { BackupType, Chunk, Datastore, Group, Namespace, Snapshot } from "@pbs-manager/database-schema";
import { useSSHConnection } from "./ssh-utils";
import { ArchiveMetadata, buildIndexFileFindCommandArray, GroupMetadata, parseIndexFilePaths } from "./pbs-index";

function* chunkGenerator<T>(arr: T[], size: number): Generator<T[]> {
    for (let i = 0; i < arr.length; i += size) {
        yield arr.slice(i, i + size);
    }
}

export interface RawChunk {
    hash_sha256: string;
    metadata_deletion?: Date;
}

async function usePartitionedArray<T, R = void>(
    entityManager: EntityManager,
    arr: T[],
    partitionSize: number,
    callback: (entityManagerInner: EntityManager, partition: T[]) => Promise<R>
): Promise<R[]> {
    const results: R[] = [];
    for (const partition of chunkGenerator(arr, partitionSize)) {
        try {
            results.push(
                await entityManager.transaction(entityManagerInner => callback(entityManagerInner, partition))
            );
        } catch (error) {
            Logger.error(
                `Error processing partition in transaction: ${error instanceof Error ? error.message : String(error)}`,
                "usePartitionedArray"
            );
        }
    }
    return results;
}

@Injectable()
export class AppService implements OnModuleInit {
    private readonly logger: Logger = new Logger(AppService.name);

    constructor(
        @InjectDataSource()
        private readonly dataSource: DataSource
    ) {}

    getData(): { message: string } {
        return { message: "Hello API" };
    }

    async onModuleInit(): Promise<void> {
        this.logger.log("AppService initialized");
        // await this.test();
        await this.test2();
    }

    async test2(datastoreId: number = 1, sshConnectionId: number = 1, hostId: number = 1): Promise<void> {
        try {
            await this.dataSource.transaction(async entityManagerOuter => {
                this.logger.log("Processing indices for datastoreId " + datastoreId);
                const datastore: Datastore = await entityManagerOuter.findOneBy(Datastore, { id: datastoreId });
                if (!datastore) {
                    throw new Error(`Datastore with id ${datastoreId} not found`);
                }
                const datastoreMountpoint: string = datastore.mountpoint;
                if (!datastoreMountpoint) {
                    throw new Error(`Mountpoint for datastore with id ${datastoreId} not found`);
                }
                const findCommandArray: string[] = buildIndexFileFindCommandArray(datastoreMountpoint, true);
                this.logger.verbose(findCommandArray);

                this.logger.verbose("Finding index files on disk using SSH");
                const options: SSHExecOptions = { stream: "both", execOptions: { pty: false } };
                const {
                    startTime,
                    endTime,
                    response,
                }: { startTime: number; endTime: number; response: string | SSHExecCommandResponse } =
                    await useSSHConnection(entityManagerOuter, { sshConnectionId }, options, async (ssh, options) =>
                        this.executeAndTimeCommand(ssh, findCommandArray, options)
                    );
                // this.logger.verbose(response);
                this.logger.verbose(`Time taken: ${endTime - startTime}ms`);
                let stdout: string;
                if (typeof response === "string") {
                    stdout = response;
                } else {
                    stdout = response.stdout;
                    if (response.stderr) {
                        this.logger.verbose(`code: ${response.code}, signal: ${response.signal}`);
                        this.logger.verbose(response.stderr);
                    }
                }

                const paths: string[] = stdout.split("\x00").filter(path => path.trim() !== "");
                this.logger.verbose(`Found ${paths.length} index files on disk for datastoreId ${datastoreId}`);
                const archivesByDatastore: Record<string, ArchiveMetadata[]> = parseIndexFilePaths(
                    paths,
                    datastoreMountpoint,
                    hostId
                );
                const archivesOnDisk: ArchiveMetadata[] = archivesByDatastore[datastoreMountpoint];
                this.logger.verbose(`Found ${archivesOnDisk.length} archives on disk for datastoreId ${datastoreId}`);

                const namespaces: Namespace[] = await this.processNamespaces(
                    entityManagerOuter,
                    datastoreId,
                    archivesOnDisk.map(archive => archive.namespaces)
                );
                this.logger.verbose(`Processed ${namespaces.length} namespaces for datastoreId ${datastoreId}`);

                const { groups, snapshots }: { groups: Group[]; snapshots: Snapshot[] } =
                    await this.processGroupsAndSnapshots(entityManagerOuter, datastoreId, archivesOnDisk, namespaces);
                this.logger.verbose(
                    `Processed ${groups.length} groups and ${snapshots.length} snapshots for datastoreId ${datastoreId}`
                );

                //TODO Process Index Files and links chunks to them
            });
        } catch (error) {
            this.logger.error(`Error executing SSH command: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private getNamespaceByPath(namespaces: Namespace[], pathParts: string[]): Namespace | null {
        let currentNamespace: Namespace | null = null;
        for (const pathPart of pathParts) {
            const nextNamespace: Namespace | undefined = namespaces.find(
                namespace =>
                    namespace.name === pathPart &&
                    namespace.parentId === (currentNamespace ? currentNamespace.id : null)
            );
            if (!nextNamespace) {
                return null;
            }
            currentNamespace = nextNamespace;
        }
        return currentNamespace;
    }

    private groupToKey(group: Group): string {
        return this.internalGroupToKey(group.datastoreId, group.namespaceId, group.type, group.backupId);
    }

    private groupMetadataToKey(datastoreId: number, namespaceId: number | null, groupMetadata: GroupMetadata): string {
        return this.internalGroupToKey(datastoreId, namespaceId, groupMetadata.type as BackupType, groupMetadata.id);
    }

    private internalGroupToKey(
        datastoreId: number,
        namespaceId: number | null,
        backupType: BackupType,
        backupId: string
    ): string {
        return `${datastoreId}-${namespaceId ?? "null"}-${backupType}-${backupId}`;
    }

    private snapshotToKey(snapshot: Snapshot): string {
        return this.internalSnapshotToKey(snapshot.group.id, snapshot.time);
    }

    private snapshotMetadataToKey(groupId: number, archiveMetadata: ArchiveMetadata): string {
        return this.internalSnapshotToKey(groupId, new Date(archiveMetadata.time));
    }

    private internalSnapshotToKey(groupId: number, creation: Date): string {
        return `${groupId}-${creation.getTime()}`;
    }

    private async processGroupsAndSnapshots(
        entityManager: EntityManager,
        datastoreId: number,
        archiveMetadataArray: ArchiveMetadata[],
        namespaces: Namespace[]
    ): Promise<{ groups: Group[]; snapshots: Snapshot[] }> {
        const groupsInDatabase: Group[] = await entityManager.find(Group, {
            where: { datastoreId },
            withDeleted: true,
        });

        const groupsInDatabaseMap: Record<string, Group> = {};
        for (const group of groupsInDatabase) {
            const key: string = this.groupToKey(group);
            groupsInDatabaseMap[key] = group;
        }
        const groupKeysInDatabase: Set<string> = new Set(Object.keys(groupsInDatabaseMap));
        const groupDataOnDiskMap: Record<string, GroupMetadata> = {};
        for (const groupData of archiveMetadataArray) {
            const namespace: Namespace | null = this.getNamespaceByPath(namespaces, groupData.namespaces);
            const key: string = this.groupMetadataToKey(datastoreId, namespace?.id, groupData);
            groupDataOnDiskMap[key] = groupData;
        }
        const groupKeysOnDisk: Set<string> = new Set(Object.keys(groupDataOnDiskMap));
        const groupKeysToCreate: Set<string> = new Set(groupKeysOnDisk);
        const groupKeysToDelete: Set<string> = new Set(groupKeysInDatabase);
        const groupKeysToRestore: Set<string> = new Set();

        for (const groupKeyInDatabase of groupKeysInDatabase) {
            groupKeysToCreate.delete(groupKeyInDatabase);
        }

        for (const groupKeyOnDisk of groupKeysOnDisk) {
            groupKeysToDelete.delete(groupKeyOnDisk);
        }

        for (const groupInDatabase of groupsInDatabase) {
            const key: string = this.groupToKey(groupInDatabase);
            if (groupInDatabase.metadata.deletion != null && groupDataOnDiskMap[key]) {
                groupKeysToRestore.add(key);
            }
        }

        const groupsToDelete: Group[] = [...groupKeysToDelete].map(groupKey => groupsInDatabaseMap[groupKey]);
        const groupsToRestore: Group[] = [...groupKeysToRestore].map(groupKey => groupsInDatabaseMap[groupKey]);
        const groupsToReturn: Group[] = [...groupKeysInDatabase]
            .filter(groupKey => !groupKeysToDelete.has(groupKey) && !groupKeysToRestore.has(groupKey))
            .map(groupKey => groupsInDatabaseMap[groupKey]);

        if (groupsToDelete.length > 0) {
            this.logger.verbose(`Marking ${groupsToDelete.length} groups as deleted for datastoreId ${datastoreId}`);
            await entityManager.softRemove(groupsToDelete, { chunk: 1000 }); //TODO Does this also cascade to snapshots?
            this.logger.verbose(
                `Marked  ${groupsToDelete.length} groups as deleted in the database for datastoreId ${datastoreId}`
            );
        }

        if (groupsToRestore.length > 0) {
            this.logger.verbose(`Marking ${groupsToRestore.length} groups as existing for datastoreId ${datastoreId}`);
            const groupsRecovered: Group[] = await entityManager.recover(groupsToRestore, { chunk: 1000 }); //TODO Does this also cascade to snapshots?
            groupsToReturn.push(...groupsRecovered);
            this.logger.verbose(
                `Marked  ${groupsToRestore.length} groups as existing in the database for datastoreId ${datastoreId}`
            );
        }

        if (groupKeysToCreate.size > 0) {
            const groupsToCreate: Group[] = [...groupKeysToCreate].map(groupKey => {
                const groupData: GroupMetadata = groupDataOnDiskMap[groupKey];
                const namespace: Namespace | null = this.getNamespaceByPath(namespaces, groupData.namespaces);
                return entityManager.create(Group, {
                    datastoreId,
                    namespaceId: namespace ? namespace.id : null,
                    type: groupData.type as BackupType,
                    backupId: groupData.id,
                });
            });
            this.logger.verbose(`Creating ${groupsToCreate.length} new group entities for datastoreId ${datastoreId}`);
            const groupsCreated: Group[] = await entityManager.save(groupsToCreate, { chunk: 1000 });
            groupsToReturn.push(...groupsCreated);
            this.logger.verbose(`Created  ${groupsToCreate.length} new group entities for datastoreId ${datastoreId}`);
        }

        const snapshotsInDatabase: Snapshot[] = await entityManager.find(Snapshot, {
            where: { group: { datastoreId } },
            relations: { group: true },
            withDeleted: true,
        });

        const snapshotsInDatabaseMap: Record<string, Snapshot> = {};
        for (const snapshot of snapshotsInDatabase) {
            const key: string = this.snapshotToKey(snapshot);
            snapshotsInDatabaseMap[key] = snapshot;
        }
        const snapshotKeysInDatabase: Set<string> = new Set(Object.keys(snapshotsInDatabaseMap));
        const snapshotDataOnDiskMap: Record<string, ArchiveMetadata> = {};
        for (const archiveData of archiveMetadataArray) {
            const namespace: Namespace | null = this.getNamespaceByPath(namespaces, archiveData.namespaces);
            const groupKey: string = this.groupMetadataToKey(datastoreId, namespace?.id, archiveData);
            const group: Group | undefined = groupsToReturn.find(group => this.groupToKey(group) === groupKey);
            if (!group) {
                this.logger.error(
                    `Group not found for snapshot with group key ${groupKey} for datastoreId ${datastoreId}`
                );
                continue;
            }
            const snapshotKey: string = this.snapshotMetadataToKey(group.id, archiveData);
            snapshotDataOnDiskMap[snapshotKey] = archiveData;
        }
        const snapshotKeysOnDisk: Set<string> = new Set(Object.keys(snapshotDataOnDiskMap));
        const snapshotKeysToCreate: Set<string> = new Set(snapshotKeysOnDisk);
        const snapshotKeysToDelete: Set<string> = new Set(snapshotKeysInDatabase);
        const snapshotKeysToRestore: Set<string> = new Set();

        for (const snapshotKeyInDatabase of snapshotKeysInDatabase) {
            snapshotKeysToCreate.delete(snapshotKeyInDatabase);
        }

        for (const snapshotKeyOnDisk of snapshotKeysOnDisk) {
            snapshotKeysToDelete.delete(snapshotKeyOnDisk);
        }

        for (const snapshotInDatabase of snapshotsInDatabase) {
            const key: string = this.snapshotToKey(snapshotInDatabase);
            if (snapshotInDatabase.metadata.deletion != null && snapshotDataOnDiskMap[key]) {
                snapshotKeysToRestore.add(key);
            }
        }

        const snapshotsToDelete: Snapshot[] = [...snapshotKeysToDelete].map(
            snapshotKey => snapshotsInDatabaseMap[snapshotKey]
        );
        const snapshotsToRestore: Snapshot[] = [...snapshotKeysToRestore].map(
            snapshotKey => snapshotsInDatabaseMap[snapshotKey]
        );
        const snapshotsToReturn: Snapshot[] = [...snapshotKeysInDatabase]
            .filter(snapshotKey => !snapshotKeysToDelete.has(snapshotKey) && !snapshotKeysToRestore.has(snapshotKey))
            .map(snapshotKey => snapshotsInDatabaseMap[snapshotKey]);

        if (snapshotsToDelete.length > 0) {
            this.logger.verbose(
                `Marking ${snapshotsToDelete.length} snapshots as deleted for datastoreId ${datastoreId}`
            );
            await entityManager.softRemove(snapshotsToDelete, { chunk: 1000 });
            this.logger.verbose(
                `Marked  ${snapshotsToDelete.length} snapshots as deleted in the database for datastoreId ${datastoreId}`
            );
        }

        if (snapshotsToRestore.length > 0) {
            this.logger.verbose(
                `Marking ${snapshotsToRestore.length} snapshots as existing for datastoreId ${datastoreId}`
            );
            const snapshotsRecovered: Snapshot[] = await entityManager.recover(snapshotsToRestore, { chunk: 1000 });
            snapshotsToReturn.push(...snapshotsRecovered);
            this.logger.verbose(
                `Marked  ${snapshotsToRestore.length} snapshots as existing in the database for datastoreId ${datastoreId}`
            );
        }

        if (snapshotKeysToCreate.size > 0) {
            const snapshotsToCreate: Snapshot[] = [...snapshotKeysToCreate]
                .map(snapshotKey => {
                    const archiveData: ArchiveMetadata = snapshotDataOnDiskMap[snapshotKey];
                    const namespace: Namespace | null = this.getNamespaceByPath(namespaces, archiveData.namespaces);
                    const groupKey: string = this.groupMetadataToKey(datastoreId, namespace?.id, archiveData);
                    const group: Group | undefined = groupsToReturn.find(group => this.groupToKey(group) === groupKey);
                    if (!group) {
                        this.logger.error(
                            `Group not found for snapshot with key ${snapshotKey} and group key ${groupKey} for datastoreId ${datastoreId}`
                        );
                        return null;
                    }
                    return entityManager.create(Snapshot, {
                        groupId: group.id,
                        time: new Date(archiveData.time),
                    });
                })
                .filter(snapshot => snapshot !== null);
            this.logger.verbose(
                `Creating ${snapshotsToCreate.length} new snapshot entities for datastoreId ${datastoreId}`
            );
            const snapshotsCreated: Snapshot[] = await entityManager.save(snapshotsToCreate, { chunk: 1000 });
            snapshotsToReturn.push(...snapshotsCreated);
            this.logger.verbose(
                `Created  ${snapshotsToCreate.length} new snapshot entities for datastoreId ${datastoreId}`
            );
        }

        return { groups: groupsToReturn, snapshots: snapshotsToReturn };
    }

    private async processNamespaces(
        entityManager: EntityManager,
        datastoreId: number,
        namespaceArrays: string[][],
        parent: Namespace | null = null,
        depth: number = 0
    ): Promise<Namespace[]> {
        const namespacesInDatabase: Namespace[] = await entityManager.find(Namespace, {
            where: { datastoreId, parentId: parent ? parent.id : IsNull() },
            withDeleted: true,
        });

        const namespaceNamesOnDisk: Set<string> = new Set(namespaceArrays.map(array => array[0]));
        const namespaceNamesInDatabase: Set<string> = new Set(namespacesInDatabase.map(namespace => namespace.name));
        const namespaceNamesToCreate: Set<string> = new Set(namespaceNamesOnDisk);
        const namespaceNamesToDelete: Set<string> = new Set(namespaceNamesInDatabase);
        const namespaceNamesToRestore: Set<string> = new Set();

        for (const namespaceNameInDatabase of namespaceNamesInDatabase) {
            namespaceNamesToCreate.delete(namespaceNameInDatabase);
        }
        for (const namespaceNameOnDisk of namespaceNamesOnDisk) {
            namespaceNamesToDelete.delete(namespaceNameOnDisk);
        }
        for (const namespaceInDatabase of namespacesInDatabase) {
            if (namespaceInDatabase.metadata.deletion != null && namespaceNamesOnDisk.has(namespaceInDatabase.name)) {
                namespaceNamesToRestore.add(namespaceInDatabase.name);
            }
        }

        const namespacesToDelete: Namespace[] = namespacesInDatabase.filter(namespace =>
            namespaceNamesToDelete.has(namespace.name)
        );
        const namespacesToRestore: Namespace[] = namespacesInDatabase.filter(namespace =>
            namespaceNamesToRestore.has(namespace.name)
        );
        const namespacesToReturn: Namespace[] = namespacesInDatabase.filter(
            namespace => !namespaceNamesToDelete.has(namespace.name) && !namespaceNamesToRestore.has(namespace.name)
        );

        if (namespacesToDelete.length > 0) {
            this.logger.verbose(
                `[${depth}] Marking ${namespacesToDelete.length} namespaces as deleted for datastoreId ${datastoreId}`
            );
            await entityManager.softRemove(namespacesToDelete, { chunk: 1000 });
            this.logger.verbose(
                `[${depth}] Marked  ${namespacesToDelete.length} namespaces as deleted in the database for datastoreId ${datastoreId}`
            );
        }

        if (namespacesToRestore.length > 0) {
            this.logger.verbose(
                `[${depth}] Marking ${namespacesToRestore.length} namespaces as existing for datastoreId ${datastoreId}`
            );
            const namespacesRecovered: Namespace[] = await entityManager.recover(namespacesToRestore, { chunk: 1000 });
            namespacesToReturn.push(...namespacesRecovered);
            this.logger.verbose(
                `[${depth}] Marked  ${namespacesToRestore.length} namespaces as existing in the database for datastoreId ${datastoreId}`
            );
        }

        if (namespaceNamesToCreate.size > 0) {
            const namespacesToCreate: Namespace[] = [...namespaceNamesToCreate].map(namespaceName =>
                entityManager.create(Namespace, {
                    datastoreId,
                    name: namespaceName,
                    parent,
                })
            );
            this.logger.verbose(
                `[${depth}] Creating ${namespacesToCreate.length} new namespace entities for datastoreId ${datastoreId}`
            );
            const namespacesCreated: Namespace[] = await entityManager.save(namespacesToCreate, { chunk: 1000 });
            namespacesToReturn.push(...namespacesCreated);
            this.logger.verbose(
                `[${depth}] Created  ${namespacesToCreate.length} new namespace entities for datastoreId ${datastoreId}`
            );
        }

        const namespaceNameMap: Record<string, Namespace> = {};
        for (const namespace of namespacesToReturn) {
            namespaceNameMap[namespace.name] = namespace;
        }

        const childNamespaceArraysMap: Record<string, string[][]> = {};
        for (const namespaceArray of namespaceArrays) {
            const namespaceName: string = namespaceArray[0];
            const childNamespaceArray: string[] = namespaceArray.slice(1);
            if (childNamespaceArray.length === 0) {
                continue;
            }
            childNamespaceArraysMap[namespaceName] ??= [];
            childNamespaceArraysMap[namespaceName].push(childNamespaceArray);
        }

        for (const [namespaceName, childNamespaceArrays] of Object.entries(childNamespaceArraysMap)) {
            if (childNamespaceArrays.length === 0) {
                continue;
            }
            const namespace: Namespace | undefined = namespaceNameMap[namespaceName];
            if (!namespace) {
                this.logger.error(
                    `[${depth}] Namespace ${namespaceName} not found in database for datastoreId ${datastoreId}`
                );
                continue;
            }
            const childNamespaces: Namespace[] = await this.processNamespaces(
                entityManager,
                datastoreId,
                childNamespaceArrays,
                namespace,
                depth + 1
            );
            namespace.children = childNamespaces;
            namespacesToReturn.push(...childNamespaces);
        }

        return namespacesToReturn;
    }

    async test(datastoreId: number = 1, sshConnectionId: number = 1, hostId: number = 1): Promise<void> {
        try {
            await this.dataSource.transaction(async entityManagerOuter => {
                this.logger.log("Processing chunks for datastoreId " + datastoreId);
                const datastore: Datastore = await entityManagerOuter.findOneBy(Datastore, { id: datastoreId });
                if (!datastore) {
                    throw new Error(`Datastore with id ${datastoreId} not found`);
                }
                const datastoreMountpoint: string = datastore.mountpoint;
                if (!datastoreMountpoint) {
                    throw new Error(`Mountpoint for datastore with id ${datastoreId} not found`);
                }
                const findCommandArray: string[] = buildChunkFileFindAndStatCommandArray(datastoreMountpoint, true);
                this.logger.verbose(findCommandArray);
                // const privateKey: string =
                //     "-----BEGIN OPENSSH PRIVATE KEY-----\n" + "REDACTED\n" + "-----END OPENSSH PRIVATE KEY-----";
                // const publicKey: string = "ssh-ed25519 REDACTED";
                // const fingerprint: string = "SHA256:REDACTED";
                // await this.dataSource.transaction(async entityManager => {
                //     const sshKeypair: SSHKeypair = await entityManager.findOneBy(SSHKeypair, { id: 1 });
                //     this.logger.verbose(sshKeypair);
                //     sshKeypair.algorithm = SSHKeyAlgorithm.ed25519;
                //     sshKeypair.fingerprintHashAlgorithm = SSHKeyFingerprintHashAlgorithm.sha256;
                //     sshKeypair.fingerprintHash = Buffer.from(fingerprint.split(":")[1], "base64");
                //     sshKeypair.fingerprint = parseFingerprint(fingerprint);
                //     sshKeypair.publicKeyFormat = SSHPublicKeyFormat.ssh;
                //     sshKeypair.publicKey = parseKey(publicKey, sshKeypair.publicKeyFormat);
                //     sshKeypair.privateKeyFormat = SSHPrivateKeyFormat.openssh;
                //     sshKeypair.privateKey = parsePrivateKey(connection.privateKey, sshKeypair.privateKeyFormat);
                //     this.logger.verbose(sshKeypair);
                //     await entityManager.save(sshKeypair);
                // });

                this.logger.verbose("Finding chunk files on disk using SSH");
                const options: SSHExecOptions = { stream: "both", execOptions: { pty: false } };
                const {
                    startTime,
                    endTime,
                    response,
                }: { startTime: number; endTime: number; response: string | SSHExecCommandResponse } =
                    await useSSHConnection(entityManagerOuter, { sshConnectionId }, options, async (ssh, options) =>
                        this.executeAndTimeCommand(ssh, findCommandArray, options)
                    );
                // this.logger.verbose(response);
                this.logger.verbose(`Time taken: ${endTime - startTime}ms`);
                let stdout: string;
                if (typeof response === "string") {
                    stdout = response;
                } else {
                    stdout = response.stdout;
                    if (response.stderr) {
                        this.logger.verbose(`code: ${response.code}, signal: ${response.signal}`);
                        this.logger.verbose(response.stderr);
                    }
                }

                const pathsAndSizes: string[][] = stdout
                    .split("\x00\x00")
                    .map(s => s.split("\x00"))
                    .filter(s => s[0].trim() !== "");
                this.logger.verbose(`Found ${pathsAndSizes.length} chunk files on disk for datastoreId ${datastoreId}`);
                const chunksByDatastore: Record<string, ChunkMetadata[]> = parseChunkFilePathsAndSizes(
                    pathsAndSizes,
                    datastoreMountpoint,
                    hostId
                );
                const chunksOnDisk: ChunkMetadata[] = chunksByDatastore[datastoreMountpoint];
                this.logger.verbose(`Found ${chunksOnDisk.length} chunks on disk for datastoreId ${datastoreId}`);

                await this.dataSource.transaction(async entityManager1 => {
                    this.logger.verbose(`Gathering existing chunks from the database for datastoreId ${datastoreId}`);
                    const chunksInDatabase: RawChunk[] = await entityManager1
                        .createQueryBuilder(Chunk, "c")
                        .select(["hash_sha256", "metadata_deletion"])
                        .where("c.datastore_id = :datastoreId", { datastoreId })
                        .withDeleted()
                        .getRawMany();
                    this.logger.verbose(
                        `Found ${chunksInDatabase.length} chunks in the database for datastoreId ${datastoreId}`
                    );

                    const hashesOnDisk: Set<string> = new Set(chunksOnDisk.map(chunk => chunk.hashSHA256));
                    const hashesInDatabase: Set<string> = new Set(chunksInDatabase.map(chunk => chunk.hash_sha256));
                    const hashesMissing: Set<string> = new Set(hashesOnDisk);
                    const hashesDeleted: Set<string> = new Set(hashesInDatabase);
                    const hashesRevived: Set<string> = new Set();

                    for (const hashInDatabase of hashesInDatabase) {
                        hashesMissing.delete(hashInDatabase);
                    }

                    for (const hashOnDisk of hashesOnDisk) {
                        hashesDeleted.delete(hashOnDisk);
                    }

                    for (const chunkInDatabase of chunksInDatabase) {
                        if (
                            chunkInDatabase.metadata_deletion != null &&
                            hashesOnDisk.has(chunkInDatabase.hash_sha256)
                        ) {
                            hashesRevived.add(chunkInDatabase.hash_sha256);
                        }
                    }

                    this.logger.verbose(
                        `Marking ${hashesDeleted.size} chunks as deleted for datastoreId ${datastoreId}`
                    );
                    await usePartitionedArray(
                        entityManager1,
                        [...hashesDeleted],
                        10000,
                        async (entityManager2: EntityManager, partition: string[]): Promise<UpdateResult> =>
                            entityManager2
                                .getRepository(Chunk)
                                .createQueryBuilder()
                                .softDelete()
                                .where("datastoreId = :datastoreId", { datastoreId })
                                .andWhere("hashSHA256 IN (:...hashes)", { hashes: partition })
                                .execute()
                    );
                    this.logger.verbose(
                        `Marked  ${hashesDeleted.size} chunks as deleted in the database for datastoreId ${datastoreId}`
                    );

                    this.logger.verbose(
                        `Marking ${hashesRevived.size} chunks as existing for datastoreId ${datastoreId}`
                    );
                    await usePartitionedArray(
                        entityManager1,
                        [...hashesRevived],
                        10000,
                        async (entityManager2: EntityManager, partition: string[]): Promise<UpdateResult> =>
                            entityManager2
                                .getRepository(Chunk)
                                .createQueryBuilder()
                                .restore()
                                .where("datastoreId = :datastoreId", { datastoreId })
                                .andWhere("hashSHA256 IN (:...hashes)", { hashes: partition })
                                .execute()
                    );
                    this.logger.verbose(
                        `Marked  ${hashesRevived.size} chunks as existing in the database for datastoreId ${datastoreId}`
                    );

                    this.logger.verbose(
                        `Creating ${hashesMissing.size} new chunk entities for datastoreId ${datastoreId}`
                    );
                    const chunksToCreate: Chunk[] = chunksByDatastore[datastoreMountpoint]
                        .filter(chunkMetadata => hashesMissing.has(chunkMetadata.hashSHA256))
                        .map(chunkMetadata => {
                            const chunk: Chunk = new Chunk();
                            chunk.datastoreId = datastoreId;
                            chunk.hashSHA256 = chunkMetadata.hashSHA256;
                            chunk.sizeBytes = chunkMetadata.sizeBytes ?? undefined;
                            return chunk;
                        });
                    await usePartitionedArray(
                        entityManager1,
                        chunksToCreate,
                        10000,
                        async (entityManager2: EntityManager, partition: Chunk[]): Promise<void> => {
                            await entityManager2
                                .createQueryBuilder()
                                .insert()
                                .into(Chunk)
                                .values(partition)
                                .orUpdate(["size_bytes"], ["datastore_id", "hash_sha256"], {
                                    indexPredicate: '"metadata_deletion" IS NULL',
                                })
                                .execute();
                        }
                    );
                    this.logger.verbose(
                        `Created  ${chunksToCreate.length} new chunk entities for datastoreId ${datastoreId}`
                    );
                });

                this.logger.log("Finished processing chunks");
            });
        } catch (error) {
            this.logger.error(`Error executing SSH command: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async executeAndTimeCommand(
        ssh: NodeSSH,
        commandArray: string[],
        options: SSHExecOptions
    ): Promise<{ startTime: number; endTime: number; response: SSHExecCommandResponse | string }> {
        const startTime: number = Date.now();
        const response: SSHExecCommandResponse | string = await this.executeCommand(ssh, commandArray, options);
        const endTime: number = Date.now();
        return { startTime, endTime, response };
    }

    private executeCommand(
        ssh: NodeSSH,
        commandArray: string[],
        options: SSHExecOptions
    ): Promise<SSHExecCommandResponse | string> {
        const command: string = commandArray.shift();
        if (commandArray.length > 0 || options.stream !== "both") {
            if (options.stream === "both") {
                return ssh.exec(command, commandArray, options as SSHExecOptions & { stream: "both" });
            } else {
                return ssh.exec(command, commandArray, options as SSHExecOptions & { stream?: "stdout" | "stderr" });
            }
            // const channel: ClientChannel = await ssh.requestShell(false);
        } else {
            return ssh.execCommand(command, options);
        }
    }
}
