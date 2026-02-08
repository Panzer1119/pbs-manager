import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Config, NodeSSH, SSHExecCommandResponse, SSHExecOptions } from "node-ssh";
import {
    Fingerprint,
    Format,
    Key,
    KeyFormatType,
    parseKey,
    parsePrivateKey,
    PrivateKey,
    PrivateKeyFormatType,
} from "sshpk";
import { DebugFunction, SyncHostVerifier } from "ssh2";
import { buildChunkFileFindAndStatCommandArray, ChunkMetadata, parseChunkFilePathsAndSizes } from "./pbs-chunk";
import { DataSource, EntityManager, UpdateResult } from "typeorm";
import { InjectDataSource } from "@nestjs/typeorm";
import { Chunk, Datastore, SSHConnection } from "@pbs-manager/database-schema";

export type ParseKeyOptions = string | (Format.ReadOptions & { filename?: string });
export type KeyDataType = string | Buffer;
export type SSHConnectionData =
    | { sshConnectionId: number }
    | {
          host: string;
          port: number;
          username: string;
          // password?: string;
          privateKey?: string;
          // passphrase?: string;
      };

export function parsePublicOrPrivateKey(
    data: KeyDataType,
    privateKey: boolean,
    format?: KeyFormatType,
    options?: ParseKeyOptions,
    ignoreErrors: boolean = false
): Key | PrivateKey {
    // Check if data is undefined
    if (data == undefined) {
        // Check if errors should be ignored
        if (!ignoreErrors) {
            throw new Error("data is undefined");
        }
        return undefined as unknown as Key | PrivateKey;
    }
    // Check if the data is a Buffer
    if (Buffer.isBuffer(data)) {
        // data = data.toString(); //FIXME This messes with the data
    }
    // Check if the data is a string
    if (typeof data === "string") {
        // Trim the data
        // data = data.trim(); //FIXME This messes with the data
    }
    let key: Key;
    // Parse the data
    if (privateKey) {
        key = parsePrivateKey(data, format as PrivateKeyFormatType, options);
    } else {
        key = parseKey(data, format as KeyFormatType, options);
    }
    // Check if the key is undefined
    if (key == undefined) {
        // Check if errors should be ignored
        if (!ignoreErrors) {
            throw new Error(`Public or Private key could not be read`);
        }
        return undefined as unknown as Key | PrivateKey;
    }
    // Check if the key is a PrivateKey
    if (privateKey && !(key instanceof PrivateKey)) {
        // Check if errors should be ignored
        if (!ignoreErrors) {
            throw new Error(`Public key was read as a Private key`);
        }
        return undefined as unknown as Key | PrivateKey;
    }
    // Return the key
    return key;
}

export interface CreateSyncHostVerifierOptions {
    format?: KeyFormatType;
    parseKeyOptions?: ParseKeyOptions;
    debug?: (message: string) => void;
}

export function createSyncHostVerifier(
    fingerprint: Fingerprint | Fingerprint[],
    options?: CreateSyncHostVerifierOptions
): SyncHostVerifier {
    // Check if fingerprint is undefined
    if (fingerprint == undefined) {
        throw new Error("fingerprint is undefined");
    }
    // Create an array of fingerprints
    const fingerprints: Fingerprint[] = Array.isArray(fingerprint) ? fingerprint : [fingerprint];
    // Check if any fingerprint is undefined
    if (fingerprints.some(fingerprint => fingerprint == undefined)) {
        throw new Error("A fingerprint is undefined");
    }
    // Return the verifier
    return (keyBuffer: Buffer): boolean => {
        // Check if keyBuffer is undefined
        if (keyBuffer == undefined) {
            return false;
        }
        // Parse the key
        const key: Key = parsePublicOrPrivateKey(keyBuffer, false, options?.format, options?.parseKeyOptions, true);
        // Check if key is undefined
        if (key == undefined) {
            Logger.warn("Public key could not be parsed", "SyncHostVerifier");
            return false;
        }
        // Check if the key is a PrivateKey
        if (key instanceof PrivateKey) {
            Logger.warn("Public key was parsed as a Private key", "SyncHostVerifier");
            return false;
        }
        // Check if the key matches any fingerprint
        return fingerprints.some(fingerprint => {
            const matches: boolean = fingerprint.matches(key);
            if (matches && options?.debug) {
                options.debug(`Fingerprint matched: ${JSON.stringify(fingerprint.toString())}`);
            }
            return matches;
        });
    };
}

export function createSSHConfig(
    host: string,
    port: number,
    username: string,
    privateKey?: PrivateKey | string,
    remoteHostKeys?: Key[],
    debug?: DebugFunction
): Config {
    // Create the config
    const config: Config = {
        host,
        port,
        username,
        privateKey: typeof privateKey === "string" ? privateKey : privateKey?.toString("openssh"),
        debug,
    };
    // Check if the private key is undefined
    if (!config.privateKey) {
        throw new Error("privateKey is undefined");
    }
    // Check if the remote host keys are undefined or empty (i.e. no host verification)
    if (!remoteHostKeys?.length) {
        // Return the config
        return config;
    }
    // Create the remote host key fingerprints array
    const remoteHostKeyFingerprints: Fingerprint[] = [];
    // Get the remote host key fingerprints
    for (const remoteHostKey of remoteHostKeys) {
        // Check if the public key is undefined
        if (remoteHostKey == undefined) {
            continue;
        }
        // Get the fingerprint
        const remoteHostKeyFingerprint: Fingerprint | undefined = remoteHostKey.fingerprint();
        // Check if the fingerprint is undefined
        if (remoteHostKeyFingerprint == undefined) {
            continue;
        }
        // Add the fingerprint to the array
        remoteHostKeyFingerprints.push(remoteHostKeyFingerprint);
    }
    // Create the host verifier
    config.hostVerifier = createSyncHostVerifier(remoteHostKeyFingerprints, { debug });
    // Return the config
    return config;
}

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
        await this.test();
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
                const sshConnection: SSHConnection = await entityManagerOuter.findOne(SSHConnection, {
                    where: { id: sshConnectionId },
                    relations: { sshKeypair: true },
                });
                if (!sshConnection) {
                    throw new Error(`SSH connection with id ${sshConnectionId} not found`);
                }
                if (!sshConnection.sshKeypair) {
                    throw new Error(`SSH keypair for SSH connection with id ${sshConnectionId} not found`);
                }
                const findCommandArray: string[] = buildChunkFileFindAndStatCommandArray(datastoreMountpoint, true);
                this.logger.verbose(findCommandArray);
                const connection: SSHConnectionData = {
                    host: sshConnection.host,
                    port: sshConnection.port,
                    username: sshConnection.username,
                    privateKey: sshConnection.sshKeypair.privateKey.toString("openssh"),
                };
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
                const options: SSHExecOptions = { stream: "both", execOptions: { pty: false } };
                const {
                    startTime,
                    endTime,
                    response,
                }: { startTime: number; endTime: number; response: string | SSHExecCommandResponse } =
                    await this.useSSHConnection(connection, options, async (ssh, options) =>
                        this.executeAndTimeCommand(ssh, findCommandArray, options)
                    );
                // this.logger.verbose(response);
                this.logger.debug(`${endTime - startTime}ms`);
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
                const chunksByDatastore: Record<string, ChunkMetadata[]> = parseChunkFilePathsAndSizes(
                    pathsAndSizes,
                    datastoreMountpoint,
                    hostId
                );
                const chunksOnDisk: ChunkMetadata[] = chunksByDatastore[datastoreMountpoint];

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

    private async useSSHConnection<R>(
        connection: SSHConnectionData,
        options: SSHExecOptions,
        callback: (client: NodeSSH, options?: SSHExecOptions) => Promise<R> | R
    ): Promise<R> {
        let config: Config | undefined;
        if ("sshConnectionId" in connection) {
            // const sshConnection: SSHConnection | undefined = await this.sshConnectionRepository.findOne({
            //     where: { id: connection.sshConnectionId },
            //     relations: { sshKeypair: true, remoteHostKeys: true },
            // });
            // if (!sshConnection) {
            //     throw new Error(`SSH connection with id ${JSON.stringify(connection.sshConnectionId)} not found`);
            // }
            // config = createSSHConfig(
            //     sshConnection.host,
            //     sshConnection.port,
            //     sshConnection.username,
            //     sshConnection.sshKeypair?.privateKey,
            //     sshConnection.remoteHostKeys?.map(remoteHostKey => remoteHostKey.publicKey)
            // );
            throw new Error("SSH connection by ID not implemented yet");
        } else if (
            "host" in connection &&
            "port" in connection &&
            "username" in connection &&
            "privateKey" in connection
        ) {
            config = createSSHConfig(connection.host, connection.port, connection.username, connection.privateKey);
        } else {
            throw new Error(`Invalid SSH connection data provided: ${JSON.stringify(connection)}`);
        }
        const ssh: NodeSSH = new NodeSSH();
        await ssh.connect(config);
        try {
            return await callback(ssh, options);
        } finally {
            ssh.dispose();
        }
    }
}
