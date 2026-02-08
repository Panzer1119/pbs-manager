import { readFileSync } from "fs";
import { EntityManager } from "typeorm";
import { Archive, ArchiveType, Datastore, Group, Namespace, Snapshot } from "@pbs-manager/database-schema";
import { NodeSSH } from "node-ssh";
import { ReadStream, SFTPWrapper } from "ssh2";
import { join, normalize } from "path";
import { useSSHConnection } from "./ssh-utils";

export type MAGIC_NUMBER_HEX_DATA_BLOB_UNENCRYPTED_UNCOMPRESSED = "42ab3807be8370a1";
export type MAGIC_NUMBER_HEX_DATA_BLOB_UNENCRYPTED_COMPRESSED = "31b958426fb6a37f";
export type MAGIC_NUMBER_HEX_DATA_BLOB_ENCRYPTED_UNCOMPRESSED = "7b6785be222d4cf0";
export type MAGIC_NUMBER_HEX_DATA_BLOB_ENCRYPTED_COMPRESSED = "e6591bbf0bbfd80b";
export type MAGIC_NUMBER_HEX_DYNAMIC_INDEX = "1c914ea519bab3cd";
export type MAGIC_NUMBER_HEX_FIXED_INDEX = "2f7f41ed91fd0fcd";

export type FILE_EXTENSION_PROXMOX_FILE_ARCHIVE = "pxar";
export type FILE_EXTENSION_PROXMOX_FILE_ARCHIVE_META = "mpxar";
export type FILE_EXTENSION_PROXMOX_FILE_ARCHIVE_PAYLOAD = "ppxar";
export type FILE_EXTENSION_DATA_BLOB = "blob";
export type FILE_EXTENSION_FIXED_INDEX = "fidx";
export type FILE_EXTENSION_DYNAMIC_INDEX = "didx";

export type Index = DynamicIndex | FixedIndex;

export interface BaseIndex {
    magicNumber: string;
    uuid: string;
    creation: Date;
    checksum: string;
    digests: string[];
}

export interface DynamicIndex extends BaseIndex {
    magicNumber: MAGIC_NUMBER_HEX_DYNAMIC_INDEX;
    offsets: number[];
}

export interface FixedIndex extends BaseIndex {
    magicNumber: MAGIC_NUMBER_HEX_FIXED_INDEX;
    sizeBytes: number;
    chunkSizeBytes: number;
}

export interface Indices {
    dynamic: DynamicIndex[];
    fixed: FixedIndex[];
}

export interface ArchiveMetadata {
    hostId?: number;
    datastoreMountpoint?: string;
    namespaces: string[];
    type: string;
    id: string;
    time: string;
    name: string;
    extension: string;
}

export const MAGIC_NUMBER_HEX_DATA_BLOB_UNENCRYPTED_UNCOMPRESSED: MAGIC_NUMBER_HEX_DATA_BLOB_UNENCRYPTED_UNCOMPRESSED =
    "42ab3807be8370a1";
export const MAGIC_NUMBER_HEX_DATA_BLOB_UNENCRYPTED_COMPRESSED: MAGIC_NUMBER_HEX_DATA_BLOB_UNENCRYPTED_COMPRESSED =
    "31b958426fb6a37f";
export const MAGIC_NUMBER_HEX_DATA_BLOB_ENCRYPTED_UNCOMPRESSED: MAGIC_NUMBER_HEX_DATA_BLOB_ENCRYPTED_UNCOMPRESSED =
    "7b6785be222d4cf0";
export const MAGIC_NUMBER_HEX_DATA_BLOB_ENCRYPTED_COMPRESSED: MAGIC_NUMBER_HEX_DATA_BLOB_ENCRYPTED_COMPRESSED =
    "e6591bbf0bbfd80b";
export const MAGIC_NUMBER_HEX_DYNAMIC_INDEX: MAGIC_NUMBER_HEX_DYNAMIC_INDEX = "1c914ea519bab3cd";
export const MAGIC_NUMBER_HEX_FIXED_INDEX: MAGIC_NUMBER_HEX_FIXED_INDEX = "2f7f41ed91fd0fcd";

export const FILE_EXTENSION_PROXMOX_FILE_ARCHIVE: FILE_EXTENSION_PROXMOX_FILE_ARCHIVE = "pxar";
export const FILE_EXTENSION_PROXMOX_FILE_ARCHIVE_META: FILE_EXTENSION_PROXMOX_FILE_ARCHIVE_META = "mpxar";
export const FILE_EXTENSION_PROXMOX_FILE_ARCHIVE_PAYLOAD: FILE_EXTENSION_PROXMOX_FILE_ARCHIVE_PAYLOAD = "ppxar";
export const FILE_EXTENSION_DATA_BLOB: FILE_EXTENSION_DATA_BLOB = "blob";
export const FILE_EXTENSION_DYNAMIC_INDEX: FILE_EXTENSION_DYNAMIC_INDEX = "didx";
export const FILE_EXTENSION_FIXED_INDEX: FILE_EXTENSION_FIXED_INDEX = "fidx";

// Parsing

function parseByteArrayAsHex(data: Buffer, byteCount: number, offset: number = 0): string {
    const array: number[] = [];
    // Read the data as an array of 1 byte unsigned little-endian numbers
    for (let i = 0; i < byteCount; i++) {
        array.push(data.readUInt8(offset + i));
    }
    // Build the hex by converting the numbers to 1 byte hex numbers and concatenating them
    return array.map(number => number.toString(16).padStart(2, "0")).join("");
}

function parseDigestsBuffer(data: Buffer): string[] {
    const digests: string[] = [];
    // Iterate over the buffer in 32 byte steps
    for (let i = 0; i < data.length; i += 32) {
        // Read the next 32 bytes as a hex string
        digests.push(parseByteArrayAsHex(data, 32, i));
    }
    return digests;
}

function parseOffsetsAndDigestsBuffer(data: Buffer): [bigint[], string[]] {
    const offsets: bigint[] = [];
    const digests: string[] = [];
    // Iterate over the buffer in 40 byte steps
    for (let i = 0; i < data.length; i += 40) {
        // Read the next 8 bytes as an unsigned 64-bit little-endian number
        offsets.push(data.readBigUInt64LE(i));
        // Read the next 32 bytes as a hex string
        digests.push(parseByteArrayAsHex(data, 32, i + 8));
    }
    return [offsets, digests];
}

function hexToUUID(hex: string): string {
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

function parseFixedIndex(header: BaseIndex, data: Buffer): FixedIndex {
    // Read the size (64 bits unsigned little-endian)
    const sizeBytes: bigint = data.readBigUInt64LE(64);
    // Read the chunk size (64 bits unsigned little-endian)
    const chunkSizeBytes: bigint = data.readBigUInt64LE(72);
    // Read the digests (everything after 4096 bytes)
    const digests: string[] = parseDigestsBuffer(data.subarray(4096));
    return {
        ...header,
        magicNumber: MAGIC_NUMBER_HEX_FIXED_INDEX,
        sizeBytes: Number(sizeBytes),
        chunkSizeBytes: Number(chunkSizeBytes),
        digests,
    };
}

function parseDynamicIndex(header: BaseIndex, data: Buffer): DynamicIndex {
    // Read the offsets and digests (everything after 4096 bytes)
    const [offsets, digests] = parseOffsetsAndDigestsBuffer(data.subarray(4096));
    return {
        ...header,
        magicNumber: MAGIC_NUMBER_HEX_DYNAMIC_INDEX,
        offsets: offsets.map(offset => Number(offset)),
        digests,
    };
}

export function parseIndex(data: Buffer): Index {
    // Read the magic code (8 bytes)
    const magicHex: string = parseByteArrayAsHex(data, 8);
    // Read the uuid (16 bytes)
    const uuidHex: string = parseByteArrayAsHex(data, 16, 8);
    // Read the creation time (epoch) (64 bits signed little-endian)
    const creationTimeEpochSeconds: bigint = data.readBigInt64LE(24);
    // Read the checksum (32 bytes)
    const checksumHex: string = parseByteArrayAsHex(data, 32, 32);
    // Build the header
    const header: BaseIndex = {
        magicNumber: magicHex,
        uuid: hexToUUID(uuidHex),
        creation: new Date(Number(creationTimeEpochSeconds) * 1000),
        checksum: checksumHex,
        digests: [],
    };
    // Check if the magic number is the fixed index magic number
    if (magicHex === MAGIC_NUMBER_HEX_FIXED_INDEX) {
        return parseFixedIndex(header, data);
    }
    // Check if the magic number is the dynamic index magic number
    if (magicHex === MAGIC_NUMBER_HEX_DYNAMIC_INDEX) {
        return parseDynamicIndex(header, data);
    }
    // Throw an error if the magic number is unknown
    throw new Error(`Unknown magic number: ${magicHex}`);
}

export function parseIndexFile(path: string): Index {
    const data: Buffer = readFileSync(path);
    return parseIndex(data);
}

// Parse via SFTP

export function parseRemoteIndexFilesWithSSHConnectionId(
    transactionalEntityManager: EntityManager,
    sshConnectionId: number,
    paths: string[]
): Promise<Indices> {
    return useSSHConnection(transactionalEntityManager, { sshConnectionId }, null, ssh =>
        parseRemoteIndexFilesWithSSH(ssh, paths)
    );
}

export async function parseRemoteIndexFilesWithSSH(ssh: NodeSSH, paths: string[]): Promise<Indices> {
    let result: Indices = { dynamic: [], fixed: [] };
    await ssh.withSFTP(async sftp => {
        result = await parseRemoteIndexFilesWithSFTP(sftp, paths);
    });
    return result;
}

export async function parseRemoteIndexFilesWithSFTP(sftp: SFTPWrapper, paths: string[]): Promise<Indices> {
    const fixedIndexArray: FixedIndex[] = [];
    const dynamicIndexArray: DynamicIndex[] = [];
    for (const path of paths) {
        const readStream: ReadStream = sftp.createReadStream(path);
        const buffer: Buffer = Buffer.concat(await arrayFromAsyncIterable(readStream));
        const index: Index = parseIndex(buffer);
        // Clear the buffer
        buffer.fill(0);
        if (index.magicNumber === MAGIC_NUMBER_HEX_FIXED_INDEX) {
            fixedIndexArray.push(index as FixedIndex);
        } else {
            dynamicIndexArray.push(index as DynamicIndex);
        }
    }
    return { dynamic: dynamicIndexArray, fixed: fixedIndexArray };
}

// Misc

export function arrayFromAsyncIterable<T>(iterable: AsyncIterable<T>): Promise<T[]> {
    return new Promise((resolve, reject) => {
        const array: T[] = [];
        iterable[Symbol.asyncIterator]()
            .next()
            .then(function process(result) {
                if (result.done) {
                    resolve(array);
                } else {
                    array.push(result.value);
                    iterable[Symbol.asyncIterator]().next().then(process).catch(reject);
                }
            })
            .catch(reject);
    });
}

export function buildIndexFileFindCommandArray(datastoreMountpoint: string, sudo: boolean = false): string[] {
    // Normalize the mountpoint
    datastoreMountpoint = normalize(datastoreMountpoint);
    // Build the command and arguments
    const command: string = sudo ? "sudo find" : "find";
    const args: string[] = [
        datastoreMountpoint,
        "-path",
        join(datastoreMountpoint, ".chunks"),
        "-prune",
        "-o",
        "-type",
        "f",
        "-name",
        "*.?idx",
        "-print0",
    ];
    // Build the command array
    return [command, ...args];
}

export function archiveTypeToFileExtension(
    archiveType: ArchiveType
): FILE_EXTENSION_DYNAMIC_INDEX | FILE_EXTENSION_FIXED_INDEX {
    switch (archiveType) {
        case ArchiveType.File:
            return FILE_EXTENSION_DYNAMIC_INDEX;
        case ArchiveType.Image:
            return FILE_EXTENSION_FIXED_INDEX;
        default:
            throw new Error(`Unknown archive type: ${archiveType}`);
    }
}

export function formatIndexFilePath(
    datastore: Datastore,
    namespaces: Namespace[],
    group: Group,
    snapshot: Snapshot,
    archive: Archive,
    datastoreMountpointParent?: string
): string {
    // Format the parts of the path
    const datastorePathPart: string = datastore.mountpoint ?? join(datastoreMountpointParent, datastore.name);
    const namespacePathPart: string = join(...namespaces.flatMap(namespace => ["ns", namespace.name]));
    const groupPathPart: string = join(group.type, group.backupId);
    const snapshotPathPart: string = snapshot.time.toISOString().replace(/\.000Z/m, "Z");
    const archivePathPart: string = `${archive.name}.${archiveTypeToFileExtension(archive.type)}`;
    // Join the parts of the path
    return join(datastorePathPart, namespacePathPart, groupPathPart, snapshotPathPart, archivePathPart);
}

export async function archiveToFilePath(
    transactionalEntityManager: EntityManager,
    archiveId: number,
    datastoreMountpointParent?: string
): Promise<string> {
    // Get the archive if it is undefined
    const archive: Archive = await transactionalEntityManager.findOneOrFail(Archive, {
        where: { id: archiveId },
        relations: {
            snapshot: {
                group: {
                    namespace: true,
                    datastore: true,
                },
            },
        },
    });
    const snapshot: Snapshot | undefined = archive.snapshot;
    // Throw an error if the snapshot is undefined
    if (snapshot == undefined) {
        throw new Error(`Snapshot is undefined`);
    }
    const group: Group | undefined = snapshot.group;
    // Throw an error if the group is undefined
    if (group == undefined) {
        throw new Error(`Group is undefined`);
    }
    const namespace: Namespace | undefined = await transactionalEntityManager
        .getTreeRepository(Namespace)
        .findAncestorsTree(group.namespace);
    const namespaces: Namespace[] = [];
    if (namespace) {
        // Iterate over all parent namespaces
        let parentNamespace: Namespace | undefined = group.namespace;
        while (parentNamespace) {
            namespaces.unshift(parentNamespace);
            parentNamespace = parentNamespace.parent;
        }
    }
    const datastore: Datastore | undefined = group.datastore;
    // Throw an error if the datastore is undefined
    if (datastore != undefined) {
        throw new Error(`Datastore is undefined`);
    }
    return formatIndexFilePath(datastore, namespaces, group, snapshot, archive, datastoreMountpointParent);
}

export const REG_EXP_INDEX_FILE_PATH: RegExp =
    /^(?:(?<datastoreMountpoint>.+?)\/)?(?:(?<namespace>ns\/.+)\/)?(?<type>vm|ct|host)\/(?<id>[^/]+)\/(?<time>\d+-\d\d-\d\dT\d\d:\d\d:\d\dZ)\/(?<name>.+)\.(?<extension>[^.]+)$/m;

export function parseIndexFilePath(path: string, datastoreMountpoint?: string, hostId?: number): ArchiveMetadata {
    // Normalize path
    path = normalize(path);
    // Match the path with the regular expression
    const match: RegExpMatchArray | null = path.match(REG_EXP_INDEX_FILE_PATH);
    // Throw an error if the path does not match the regular expression
    if (!match) {
        throw new Error(`Index file path does not match regular expression: ${path}`);
    }
    // Get the groups from the match
    const groups: Record<string, string> | undefined = match.groups;
    // Throw an error if the groups are undefined
    if (!groups) {
        throw new Error(`Groups are undefined: ${path}`);
    }
    return {
        hostId,
        datastoreMountpoint: groups.datastoreMountpoint || datastoreMountpoint,
        namespaces: groups.namespace?.replace(/ns\//g, "")?.split("/"),
        type: groups.type,
        id: groups.id,
        time: groups.time,
        name: groups.name,
        extension: groups.extension,
    };
}

export function parseIndexFilePaths(
    paths: string[],
    datastoreMountpoint?: string,
    hostId?: number
): Record<string, ArchiveMetadata[]> {
    // Create an empty object to store the paths grouped by the datastore mountpoint
    const pathsByDatastore: Record<string, ArchiveMetadata[]> = {};
    // Parse each path and group it by the datastore mountpoint
    for (const path of paths) {
        const archiveMetadata: ArchiveMetadata = parseIndexFilePath(path, datastoreMountpoint, hostId);
        pathsByDatastore[archiveMetadata.datastoreMountpoint] ??= [];
        pathsByDatastore[archiveMetadata.datastoreMountpoint].push(archiveMetadata);
    }
    // Return the paths grouped by the datastore mountpoint
    return pathsByDatastore;
}
