import { ParsedData } from "../orchestration/full-sync";
import { Archive, ArchiveType, BackupType, Datastore, Group, Namespace, Snapshot } from "@pbs-manager/database-schema";
import { GroupAdapter, RawGroup } from "../adapters/group.adapter";
import { Key } from "../engine/adapter";
import { RawSnapshot, SnapshotAdapter } from "../adapters/snapshot.adapter";
import { posix } from "path";
import { ReadStream, SFTPWrapper, Stats } from "ssh2";
import { buffer } from "stream/consumers";

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
    path?: string;
    magicNumberHex: string;
    uuid: string;
    creation: Date;
    checksum: string;
    bodyOffset: number;
    digests: string[];
}

export interface DynamicIndex extends BaseIndex {
    magicNumberHex: MAGIC_NUMBER_HEX_DYNAMIC_INDEX;
    offsets: number[];
}

export interface FixedIndex extends BaseIndex {
    magicNumberHex: MAGIC_NUMBER_HEX_FIXED_INDEX;
    sizeBytes: number;
    chunkSizeBytes: number;
}

export interface Indices {
    dynamic: DynamicIndex[];
    fixed: FixedIndex[];
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

export const REG_EXP_INDEX_FILE_PATH: RegExp =
    /^(?<datastoreMountpoint>.+?\/(?<datastoreName>[^/]+))\/(?:\.zfs\/snapshot\/(?<snapshot>[^/]+)+\/)?(?<namespace>(?:ns\/[^/]+\/)*)(?<type>vm|ct|host)\/(?<id>[^/]+)\/(?<timestamp>\d+-\d\d-\d\dT\d\d:\d\d:\d\dZ)\/(?<name>[^/]+)\.(?<extension>[^./]+)$/m;

export function fileExtensionToArchiveType(fileExtension: string): ArchiveType {
    switch (fileExtension) {
        case "fidx":
            return ArchiveType.Image;
        case "didx":
            return ArchiveType.File;
        default:
            throw new Error(`Unknown file extension: ${fileExtension}`);
    }
}

export function parseIndexFilePaths(hostId: number, filePaths: string[]): ParsedData {
    // Sort the file paths
    filePaths.sort();
    const parsedData: ParsedData = {
        datastores: [],
        namespaces: [],
        groups: [],
        snapshots: [],
        fileArchives: [],
        imageArchives: [],
    };
    for (const filePath of filePaths) {
        const match: RegExpExecArray | null = REG_EXP_INDEX_FILE_PATH.exec(filePath);
        if (!match || !match.groups) {
            throw new Error(`File path ${JSON.stringify(filePath)} does not match expected format`);
        }
        const { datastoreMountpoint, datastoreName, snapshot, namespace, type, id, timestamp, name, extension } =
            match.groups;
        if (!datastoreName) {
            throw new Error(`File path ${JSON.stringify(filePath)} does not contain a datastore name`);
        }
        if (!datastoreMountpoint) {
            throw new Error(`File path ${JSON.stringify(filePath)} does not contain a datastore mountpoint`);
        }
        // Snapshot is optional, so no check
        // Namespace is optional, so no check
        if (!type) {
            throw new Error(`File path ${JSON.stringify(filePath)} does not contain a backup type`);
        }
        if (!id) {
            throw new Error(`File path ${JSON.stringify(filePath)} does not contain an id`);
        }
        if (!timestamp) {
            throw new Error(`File path ${JSON.stringify(filePath)} does not contain a timestamp`);
        }
        if (!name) {
            throw new Error(`File path ${JSON.stringify(filePath)} does not contain a name`);
        }
        if (!extension) {
            throw new Error(`File path ${JSON.stringify(filePath)} does not contain an extension`);
        }
        if (
            !parsedData.datastores.some(
                ds => ds.hostId === hostId && ds.name === datastoreName && ds.mountpoint === datastoreMountpoint
            )
        ) {
            parsedData.datastores.push({ hostId, name: datastoreName, mountpoint: datastoreMountpoint });
        }
        if (snapshot) {
            //TODO Make use of the zfs snapshot, or ignore it for now?
        }
        let namespacePath: string | undefined = undefined;
        if (namespace) {
            namespacePath = namespace.endsWith("/") ? namespace.slice(0, -1) : namespace;
            // Remove every odd part (should be "ns") to get the actual namespace parts
            const namespacePathParts: string[] = namespacePath.split("/").filter((_, index) => index % 2 === 1);
            let currentNamespacePath: string = "";
            for (const part of namespacePathParts) {
                if (currentNamespacePath !== "") {
                    currentNamespacePath += `/${part}`;
                } else {
                    currentNamespacePath = part;
                }
                if (
                    !parsedData.namespaces.some(
                        ns => ns.datastoreMountpoint === datastoreMountpoint && ns.path === currentNamespacePath
                    )
                ) {
                    parsedData.namespaces.push({ datastoreMountpoint, path: currentNamespacePath });
                }
            }
            namespacePath = currentNamespacePath;
        }
        let rawGroup: RawGroup | undefined = parsedData.groups.find(
            g =>
                g.datastoreMountpoint === datastoreMountpoint &&
                g.namespacePath === namespacePath &&
                g.backupType === type &&
                g.backupId === id
        );
        if (!rawGroup) {
            rawGroup = {
                datastoreMountpoint,
                namespacePath,
                backupType: type as BackupType,
                backupId: id,
            };
            parsedData.groups.push(rawGroup);
        }
        const groupKey: Key = GroupAdapter.key(datastoreMountpoint, namespacePath, type as BackupType, id);
        const timestampDate: Date = new Date(timestamp);
        const timestampTime: number = timestampDate.getTime();
        let rawSnapshot: RawSnapshot | undefined = parsedData.snapshots.find(
            s => s.groupKey === groupKey && s.timestamp?.getTime() === timestampTime
        );
        if (!rawSnapshot) {
            rawSnapshot = {
                groupKey,
                timestamp: timestampDate,
            };
            parsedData.snapshots.push(rawSnapshot);
        }
        const snapshotKey: Key = SnapshotAdapter.key(groupKey, timestampDate);
        const archiveType: ArchiveType = fileExtensionToArchiveType(extension);
        switch (archiveType) {
            case ArchiveType.File:
                if (!parsedData.fileArchives.some(a => a.snapshotKey === snapshotKey && a.name === name)) {
                    parsedData.fileArchives.push({ snapshotKey, name });
                }
                break;
            case ArchiveType.Image:
                if (!parsedData.imageArchives.some(a => a.snapshotKey === snapshotKey && a.name === name)) {
                    parsedData.imageArchives.push({ snapshotKey, name });
                }
                break;
            default:
                throw new Error(`Unknown archive type: ${archiveType}`);
        }
    }
    return parsedData;
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
    namespace: Namespace | undefined,
    group: Group,
    snapshot: Snapshot,
    archive: Archive
): string {
    if (!datastore.mountpoint) {
        throw new Error(`Datastore ${datastore.name} does not have a mountpoint`);
    }
    if (namespace && !namespace.path) {
        throw new Error(`Namespace ${namespace.path} does not have a path`);
    }
    const pathParts: string[] = [];
    // Add the datastore mountpoint
    pathParts.push(datastore.mountpoint);
    // Add the namespace path if it exists, replacing every "/" with "/ns/"
    if (namespace?.path) {
        const formattedNamespacePath: string = namespace.path.replace(/\//g, "/ns/");
        pathParts.push("ns", formattedNamespacePath);
    }
    // Add the group type and backup id
    pathParts.push(group.type, group.backupId);
    // Add the snapshot timestamp
    pathParts.push(snapshot.time.toISOString().replace(/\.000Z$/m, "Z"));
    // Add the archive name and file extension
    pathParts.push(`${archive.name}.${archiveTypeToFileExtension(archive.type)}`);
    // Join and normalize the parts of the path
    return posix.join(...pathParts);
}

export function archiveToFilePath<T extends Archive>(
    archive: T,
    datastoreMap?: Map<number, Datastore>,
    namespaceMap?: Map<number, Namespace>,
    groupMap?: Map<number, Group>,
    snapshotMap?: Map<number, Snapshot>
): string {
    let snapshot: Snapshot | undefined = archive.snapshot;
    // Check if the snapshot is loaded
    if (!snapshot) {
        if (!archive.snapshotId) {
            throw new Error(`Archive ${archive.id} does not have a snapshotId`);
        } else if (snapshotMap) {
            snapshot = snapshotMap.get(archive.snapshotId);
            if (!snapshot) {
                throw new Error(`Snapshot with id ${archive.snapshotId} not found in snapshotMap`);
            }
        } else {
            throw new Error(`Archive ${archive.id} does not have snapshot relation loaded`);
        }
    }
    let group: Group | undefined = snapshot.group;
    // Check if the group is loaded
    if (!group) {
        if (!snapshot.groupId) {
            throw new Error(`Snapshot ${snapshot.id} does not have a groupId`);
        } else if (groupMap) {
            group = groupMap.get(snapshot.groupId);
            if (!group) {
                throw new Error(`Group with id ${snapshot.groupId} not found in groupMap`);
            }
        } else {
            throw new Error(`Snapshot ${snapshot.id} does not have group relation loaded`);
        }
    }
    let datastore: Datastore | undefined = group.datastore;
    // Check if the datastore is loaded
    if (!datastore) {
        if (!group.datastoreId) {
            throw new Error(`Group ${group.id} does not have a datastoreId`);
        } else if (datastoreMap) {
            datastore = datastoreMap.get(group.datastoreId);
            if (!datastore) {
                throw new Error(`Datastore with id ${group.datastoreId} not found in datastoreMap`);
            }
        } else {
            throw new Error(`Group ${group.id} does not have datastore relation loaded`);
        }
    }
    let namespace: Namespace | undefined = group.namespace;
    // Check if the namespace is loaded
    if (!namespace && group.namespaceId) {
        if (namespaceMap) {
            namespace = namespaceMap.get(group.namespaceId);
            if (!namespace) {
                throw new Error(`Namespace with id ${group.namespaceId} not found in namespaceMap`);
            }
        } else {
            throw new Error(`Group ${group.id} does not have namespace relation loaded`);
        }
    }
    return formatIndexFilePath(datastore, namespace, group, snapshot, archive);
}

// Parsing Binary Functions

// // Parsing Binary Utils

function sliceToHex(data: Buffer, byteCount: number, offset = 0): string {
    if (data.length < offset + byteCount) {
        throw new Error(`Data length ${data.length} is less than expected byte count ${byteCount} at offset ${offset}`);
    }
    return data.subarray(offset, offset + byteCount).toString("hex");
}

function parseDigestsBuffer(data: Buffer): string[] {
    if (data.length % 32 !== 0) {
        throw new Error(`Buffer length ${data.length} is not a multiple of 32`);
    }
    const digests: string[] = [];
    // Iterate over every 32 bytes
    for (let i = 0; i < data.length; i += 32) {
        // Read 32 bytes as hex
        digests.push(sliceToHex(data, 32, i));
    }
    return digests;
}

function parseOffsetsAndDigestsBuffer(data: Buffer): { offset: bigint; digest: string }[] {
    if (data.length % 40 !== 0) {
        throw new Error(`Buffer length ${data.length} is not a multiple of 40`);
    }
    const result: { offset: bigint; digest: string }[] = [];
    // Iterate over every 40 bytes
    for (let i = 0; i < data.length; i += 40) {
        // Read 8 bytes as an unsigned little-endian bigint
        const offset: bigint = data.readBigUInt64LE(i);
        // Read next 32 bytes as hex
        const digest: string = sliceToHex(data, 32, i + 8);
        result.push({ offset, digest });
    }
    return result;
}

function hexToUUID(hex: string): string {
    if (hex.length !== 32) {
        throw new Error(`Expected 32 hex characters, got ${hex.length}`);
    }
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join("-");
}

// // Parsing Index Functions

function parseFixedIndex(header: BaseIndex, data: Buffer): FixedIndex {
    // Read the size (64 bits unsigned little-endian)
    const sizeBytes: bigint = data.readBigUInt64LE(64);
    // Read the chunk size (64 bits unsigned little-endian)
    const chunkSizeBytes: bigint = data.readBigUInt64LE(72);
    // Read the digests (everything after 4096 bytes)
    const digests: string[] = parseDigestsBuffer(data.subarray(header.bodyOffset));
    return {
        ...header,
        magicNumberHex: MAGIC_NUMBER_HEX_FIXED_INDEX,
        sizeBytes: Number(sizeBytes),
        chunkSizeBytes: Number(chunkSizeBytes),
        digests,
    };
}

function parseDynamicIndex(header: BaseIndex, data: Buffer): DynamicIndex {
    // Read the offsets and digests (everything after 4096 bytes)
    const offsetsAndDigests: { offset: bigint; digest: string }[] = parseOffsetsAndDigestsBuffer(
        data.subarray(header.bodyOffset)
    );
    return {
        ...header,
        magicNumberHex: MAGIC_NUMBER_HEX_DYNAMIC_INDEX,
        digests: offsetsAndDigests.map(e => e.digest),
        offsets: offsetsAndDigests.map(e => Number(e.offset)),
    };
}

export function parseIndex(data: Buffer, path?: string): Index {
    // Read the magic number code (8 bytes)
    const magicNumberHex: string = sliceToHex(data, 8);
    // Read the uuid (16 bytes)
    const uuidHex: string = sliceToHex(data, 16, 8);
    // Read the creation time (epoch) (64 bits signed little-endian)
    const creationTimeEpochSeconds: bigint = data.readBigInt64LE(24);
    // Read the checksum (32 bytes)
    const checksumHex: string = sliceToHex(data, 32, 32);
    // Build the header
    const header: BaseIndex = {
        path,
        magicNumberHex,
        uuid: hexToUUID(uuidHex),
        creation: new Date(Number(creationTimeEpochSeconds) * 1000),
        checksum: checksumHex,
        bodyOffset: 4096,
        digests: [],
    };
    // Check if the magic number is the fixed index magic number
    if (magicNumberHex === MAGIC_NUMBER_HEX_FIXED_INDEX) {
        return parseFixedIndex(header, data);
    }
    // Check if the magic number is the dynamic index magic number
    if (magicNumberHex === MAGIC_NUMBER_HEX_DYNAMIC_INDEX) {
        return parseDynamicIndex(header, data);
    }
    // Throw an error if the magic number is unknown
    throw new Error(`Unknown magic number: ${magicNumberHex}`);
}

// Parse via SFTP

export async function parseRemoteIndexFilesWithSFTP(sftp: SFTPWrapper, paths: string[]): Promise<Indices> {
    const fixedIndexArray: FixedIndex[] = [];
    const dynamicIndexArray: DynamicIndex[] = [];
    for (const path of paths) {
        const exists: boolean = await new Promise<boolean>(
            (resolve: (value: boolean) => void, reject: () => void): void => {
                const timer: NodeJS.Timeout = setTimeout((): void => reject(), 5000);
                sftp.stat(path, (err: Error | undefined, stats: Stats): void => {
                    clearTimeout(timer);
                    resolve(!err && stats.isFile());
                });
            }
        );
        if (!exists) {
            // throw new Error(`File ${path} does not exist on remote server`);
            // Silently fail, we can check for missing indices later
            continue;
        }
        const readStream: ReadStream = sftp.createReadStream(path);
        const data: Buffer = await buffer(readStream);
        const index: Index = parseIndex(data, path);
        // Clear the buffer
        data.fill(0);
        switch (index.magicNumberHex) {
            case MAGIC_NUMBER_HEX_FIXED_INDEX:
                fixedIndexArray.push(index as FixedIndex);
                break;
            case MAGIC_NUMBER_HEX_DYNAMIC_INDEX:
                dynamicIndexArray.push(index as DynamicIndex);
                break;
            default:
                throw new Error(`Unknown magic number: ${index["magicNumberHex"]} for file ${JSON.stringify(path)}`);
        }
    }
    return { dynamic: dynamicIndexArray, fixed: fixedIndexArray };
}
