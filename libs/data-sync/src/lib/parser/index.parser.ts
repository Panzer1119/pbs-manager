import { ParsedData } from "../orchestration/full-sync";
import { ArchiveType, BackupType } from "@pbs-manager/database-schema";
import { GroupAdapter, RawGroup } from "../adapters/group.adapter";
import { Key } from "../engine/adapter";
import { RawSnapshot, SnapshotAdapter } from "../adapters/snapshot.adapter";

export const REG_EXP_INDEX_FILE_PATH: RegExp =
    /^(?<datastoreMountpoint>.+?\/(?<datastoreName>[^/]+))\/(?:\.zfs\/snapshot\/(?<snapshot>[^/]+)+\/)?(?<namespace>(?:ns\/[^/]+\/)*)(?<type>vm|ct|host)\/(?<id>[^/]+)\/(?<timestamp>\d+-\d\d-\d\dT\d\d:\d\d:\d\dZ)\/(?<name>[^/]+)\.(?<extension>[^./]+)$/m;

export function parseIndexFilePaths(hostId: number, filePaths: string[]): ParsedData {
    // Sort the file paths
    filePaths.sort();
    const parsedData: ParsedData = {
        datastores: [],
        namespaces: [],
        groups: [],
        snapshots: [],
        archives: [],
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
            const namespacePathParts: string[] = namespacePath.split("/").filter((_, index) => index % 2 === 0);
            namespacePath = namespacePathParts.join("/");
            if (
                !parsedData.namespaces.some(
                    ns => ns.datastoreMountpoint === datastoreMountpoint && ns.path === namespacePath
                )
            ) {
                parsedData.namespaces.push({ datastoreMountpoint, path: namespacePath });
            }
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
        if (!parsedData.archives.some(a => a.snapshotKey === snapshotKey && a.type === type && a.name === name)) {
            parsedData.archives.push({
                snapshotKey,
                type: type as ArchiveType,
                name,
            });
        }
    }
    return parsedData;
}
