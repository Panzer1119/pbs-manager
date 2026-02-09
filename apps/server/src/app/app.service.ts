import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { NodeSSH, SSHExecCommandResponse, SSHExecOptions } from "node-ssh";
import { buildChunkFileFindAndStatCommandArray, ChunkMetadata, parseChunkFilePathsAndSizes } from "./pbs-chunk";
import { DataSource, EntityManager, IsNull, UpdateResult } from "typeorm";
import { InjectDataSource } from "@nestjs/typeorm";
import { Chunk, Datastore, Namespace } from "@pbs-manager/database-schema";
import { useSSHConnection } from "./ssh-utils";
import { ArchiveMetadata, buildIndexFileFindCommandArray, parseIndexFilePaths } from "./pbs-index";

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

                //TODO
            });
        } catch (error) {
            this.logger.error(`Error executing SSH command: ${error instanceof Error ? error.message : String(error)}`);
        }
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
            await entityManager.softRemove(namespacesToDelete, { chunk: 1000 }); //TODO Does this also save the entities?
            this.logger.verbose(
                `[${depth}] Marked  ${namespacesToDelete.length} namespaces as deleted in the database for datastoreId ${datastoreId}`
            );
        }

        if (namespacesToRestore.length > 0) {
            this.logger.verbose(
                `[${depth}] Marking ${namespacesToRestore.length} namespaces as existing for datastoreId ${datastoreId}`
            );
            const namespacesRecovered: Namespace[] = await entityManager.recover(namespacesToRestore, { chunk: 1000 }); //TODO Does this also save the entities?
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
                //     "-----BEGIN OPENSSH PRIVATE KEY-----\n" + "TODO\n" + "-----END OPENSSH PRIVATE KEY-----";
                // const publicKey: string = "ssh-ed25519 TODO";
                // const fingerprint: string = "SHA256:TODO";
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
