export function makeKey(...parts: unknown[]): string {
    return JSON.stringify(parts);
}
