import { join, normalize } from "path";
import { Logger } from "@nestjs/common";

export interface ChunkMetadata {
    hostId?: number;
    datastoreMountpoint?: string;
    hashSHA256: string;
    sizeBytes?: number;
}

export function buildChunkFileFindCommandArray(datastoreMountpoint: string, sudo: boolean = false): string[] {
    // Normalize the mountpoint
    datastoreMountpoint = normalize(datastoreMountpoint);
    // Build the command and arguments
    const command: string = sudo ? "sudo find" : "find";
    const args: string[] = [join(datastoreMountpoint, ".chunks"), "-type", "f", "-print0"];
    // Build the command array
    return [command, ...args];
}

export function buildChunkFileFindAndStatCommandArray(datastoreMountpoint: string, sudo: boolean = false): string[] {
    // Normalize the mountpoint
    datastoreMountpoint = normalize(datastoreMountpoint);
    // Build the command and arguments
    const command: string = sudo ? "sudo find" : "find";
    const args: string[] = [join(datastoreMountpoint, ".chunks"), "-type", "f", "-printf", "%p\\0%s\\0\\0"];
    // Build the command array
    return [command, ...args];
}

export function buildChunkFileFindStatCommandArray(datastoreMountpoint: string, sudo: boolean = false): string[] {
    // Normalize the mountpoint
    datastoreMountpoint = normalize(datastoreMountpoint);
    // Build the command and arguments
    const command: string = sudo ? "sudo find" : "find";
    const args: string[] = [
        join(datastoreMountpoint, ".chunks"),
        "-type",
        "f",
        "-print0",
        "|",
        "xargs",
        "-0",
        // '-P"$(nproc)"',
        "stat",
        '--printf="%n\\0%s\\0\\0"',
    ];
    // Build the command array
    const cmd: string = `${command} ${args.join(" ")}`;
    if (cmd.includes("'")) {
        Logger.warn(`Command contains single quotes, which causes issues: ${cmd}`);
    }
    return ["sh", "-c", "--", `${cmd}`];
}

// export function buildChunkFileFindStatCommandArray(datastoreMountpoint: string, sudo: boolean = false): string[] {
//     // Normalize the mountpoint
//     datastoreMountpoint = normalize(datastoreMountpoint);
//     // Build the command and arguments
//     const command: string = sudo ? "sudo find" : "find";
//     const args: string[] = [
//         join(datastoreMountpoint, ".chunks"),
//         "-type",
//         "f",
//         "-print0",
//         "|",
//         "xargs",
//         "-0",
//         '-P"$(nproc)"',
//         "stat",
//         "--printf='%n %s\\0'",
//     ];
//     // Build the command array
//     return ["sh -c", `'${command} ${args.join(" ").replace(/'/g, `'\\''`)})'`];
// }

// export function buildChunkFileFindStatCommandArray(datastoreMountpoint: string, sudo: boolean = false): string[] {
//     // Normalize the mountpoint
//     datastoreMountpoint = normalize(datastoreMountpoint);
//     // Build the command and arguments
//     const command: string = sudo ? "sudo find" : "find";
//     const args: string[] = [
//         join(datastoreMountpoint, ".chunks"),
//         "-type",
//         "f",
//         "-print0",
//         "|",
//         "xargs",
//         "-0",
//         '-P"$(nproc)"',
//         "stat",
//         "--printf='%n %s\\0'",
//     ];
//     // Build the command array
//     return [command, ...args];
// }

export const REG_EXP_CHUNK_FILE_PATH: RegExp =
    /^(?:(?<datastoreMountpoint>.+)\/)?\.chunks\/[0-9a-fA-F]{4}\/(?<hashSHA256>[0-9a-fA-F]+)$/m;

export const REG_EXP_CHUNK_FILE_PATH_WITH_SIZE: RegExp =
    /^(?:(?<datastoreMountpoint>.+)\/)?\.chunks\/[0-9a-fA-F]{4}\/(?<hashSHA256>[0-9a-fA-F]+)(?:\s(?<sizeBytes>\d+))?$/m;

export function parseChunkFilePath(
    path: string,
    datastoreMountpoint?: string,
    hostId?: number,
    withSize: boolean = true
): ChunkMetadata {
    // Normalize path
    path = normalize(path);
    // Match the path with the regular expression
    const match: RegExpMatchArray | null = withSize
        ? path.match(REG_EXP_CHUNK_FILE_PATH_WITH_SIZE)
        : path.match(REG_EXP_CHUNK_FILE_PATH);
    // Throw an error if the path does not match the regular expression
    if (!match) {
        throw new Error(`PBS chunk file path does not match regular expression: ${path}`);
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
        hashSHA256: groups.hashSHA256,
        sizeBytes: groups.sizeBytes ? parseInt(groups.sizeBytes, 10) : undefined,
    };
}

export function parseChunkFilePaths(
    paths: string[],
    datastoreMountpoint?: string,
    hostId?: number,
    withSize: boolean = true
): Record<string, ChunkMetadata[]> {
    // Create an empty object to store the paths grouped by the datastore mountpoint
    const pathsByDatastore: Record<string, ChunkMetadata[]> = {};
    // Parse each path and group it by the datastore mountpoint
    for (const path of paths) {
        const chunkMetadata: ChunkMetadata = parseChunkFilePath(path, datastoreMountpoint, hostId, withSize);
        pathsByDatastore[chunkMetadata.datastoreMountpoint] ??= [];
        pathsByDatastore[chunkMetadata.datastoreMountpoint].push(chunkMetadata);
    }
    // Return the paths grouped by the datastore mountpoint
    return pathsByDatastore;
}

export function parseChunkFilePathsAndSizes(
    pathsAndSizes: string[][],
    datastoreMountpoint?: string,
    hostId?: number
): Record<string, ChunkMetadata[]> {
    // Create an empty object to store the paths grouped by the datastore mountpoint
    const pathsByDatastore: Record<string, ChunkMetadata[]> = {};
    // Parse each path and group it by the datastore mountpoint
    for (const pathAndSize of pathsAndSizes) {
        const path: string = pathAndSize[0];
        const sizeBytes: number | undefined = pathAndSize.length > 1 ? parseInt(pathAndSize[1], 10) : undefined;
        const chunkMetadata: ChunkMetadata = parseChunkFilePath(path, datastoreMountpoint, hostId, false);
        chunkMetadata.sizeBytes = sizeBytes;
        pathsByDatastore[chunkMetadata.datastoreMountpoint] ??= [];
        pathsByDatastore[chunkMetadata.datastoreMountpoint].push(chunkMetadata);
    }
    // Return the paths grouped by the datastore mountpoint
    return pathsByDatastore;
}
