import { Namespace } from "@pbs-manager/database-schema";

export function wireNamespaceParents(namespaces: Iterable<Namespace>): void {
    const map: Map<string, Namespace> = new Map<string, Namespace>();
    for (const namespace of namespaces) {
        if (!namespace.path) {
            throw new Error(`Namespace with id ${namespace.id} has no path`);
        }
        map.set(namespace.path, namespace);
    }
    // Sort namespaces by path length to ensure parents are processed before children
    const sortedNamespaces: Namespace[] = Array.from(namespaces).sort((a, b) => {
        if (!a.path || !b.path) {
            throw new Error(`Namespace with id ${a.id} or ${b.id} has no path`);
        }
        return a.path.length - b.path.length;
    });
    for (const namespace of sortedNamespaces) {
        if (!namespace.path) {
            throw new Error(`Namespace with id ${namespace.id} has no path`);
        }
        const idx: number = namespace.path.lastIndexOf("/");
        if (idx === -1) {
            //TODO Ensure that setting parent to undefined sets it null in the database and not just ignores the update
            namespace.parent = undefined;
        } else {
            const parentPath: string = namespace.path.slice(0, idx);
            const parent: Namespace | undefined = map.get(parentPath);
            if (!parent) {
                throw new Error(
                    `Parent namespace with path ${parentPath} not found for namespace with id ${namespace.id}`
                );
            }
            namespace.parent = parent;
        }
    }
}
