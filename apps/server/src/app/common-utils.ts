import { posix } from "path";

export function joinPosixPaths(...paths: string[]): string {
    return posix.join(...paths);
}

export function relativePosixPath(from: string, to: string): string {
    return posix.relative(from, to);
}

export function normalizePosixPath(path: string): string {
    return posix.normalize(path);
}

export function dirnamePosixPath(path: string): string {
    return posix.dirname(path);
}

export function basenamePosixPath(path: string, ext?: string | undefined): string {
    return posix.basename(path, ext);
}

export function extnamePosixPath(path: string): string {
    return posix.extname(path);
}
