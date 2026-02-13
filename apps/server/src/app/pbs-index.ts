import { joinPosixPaths, normalizePosixPath } from "./common-utils";

export interface ArchiveMetadata {
    path: string;
    hostId?: number;
    datastoreMountpoint?: string;
    namespaces: string[];
    type: string;
    id: string;
    time: string;
    name: string;
    extension: string;
}

export interface GroupMetadata {
    datastoreMountpoint?: string;
    namespaces: string[];
    type: string;
    id: string;
}

// Misc

export function buildIndexFileFindCommandArray(datastoreMountpoint: string, sudo: boolean = false): string[] {
    // Normalize the mountpoint
    datastoreMountpoint = normalizePosixPath(datastoreMountpoint);
    // Build the command and arguments
    const command: string = sudo ? "sudo find" : "find";
    const args: string[] = [
        datastoreMountpoint,
        "-path",
        joinPosixPaths(datastoreMountpoint, ".chunks"),
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

export const REG_EXP_INDEX_FILE_PATH: RegExp =
    /^(?:(?<datastoreMountpoint>.+?)\/)?(?:(?<namespace>ns\/.+)\/)?(?<type>vm|ct|host)\/(?<id>[^/]+)\/(?<time>\d+-\d\d-\d\dT\d\d:\d\d:\d\dZ)\/(?<name>.+)\.(?<extension>[^.]+)$/m;

export function parseIndexFilePath(path: string, datastoreMountpoint?: string, hostId?: number): ArchiveMetadata {
    // Normalize path
    path = normalizePosixPath(path);
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
    //TODO How do we handle ".zfs/snapshot/..." in the path?
    return {
        path,
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

//TODO Replace the function in pbs.processor.ts with this function?
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
