import {
    Fingerprint,
    FingerprintParseOptions,
    Format,
    Key,
    KeyFormatType as PublicKeyFormatType,
    parseFingerprint as parseFingerprintInternal,
    parseKey as parsePublicKey,
    parsePrivateKey,
    PrivateKey,
    PrivateKeyFormatType,
} from "sshpk";
import { DebugFunction, SFTPWrapper, SyncHostVerifier } from "ssh2";
import { Config, NodeSSH } from "node-ssh";
import { Logger } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { SSHConnection, SSHKeypair } from "@pbs-manager/database-schema";

export type KeyFormatType = PublicKeyFormatType | PrivateKeyFormatType;
export type ParseKeyOptions = string | (Format.ReadOptions & { filename?: string });
export type WriteKeyOptions = Format.WriteOptions;
export type KeyDataType = string | Buffer;
export type FingerprintDataType = string | Buffer;
export type SSHConnectionData = { sshConnectionId: number } | SSHConnection | Config;

export interface SSHKeyTransformerOptionsGeneric<T extends KeyFormatType> {
    format?: T;
    useFormatForParsing?: boolean;
    parseKeyOptions?: ParseKeyOptions;
    writeKeyOptions?: WriteKeyOptions;
}

export type SSHPrivateKeyTransformerOptions = {
    privateKey: true;
} & SSHKeyTransformerOptionsGeneric<PrivateKeyFormatType>;
export type SSHPublicKeyTransformerOptions = {
    privateKey: false;
} & SSHKeyTransformerOptionsGeneric<PublicKeyFormatType>;

export type SSHKeyTransformerOptions = { privateKey: boolean } & (
    | SSHPrivateKeyTransformerOptions
    | SSHPublicKeyTransformerOptions
);

export type SSHFingerprintTransformerOptions = {
    format?: "hex" | "base64";
    fingerprintParseOptions?: FingerprintParseOptions;
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
        key = parsePublicKey(data, format as PublicKeyFormatType, options);
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

export function parseFingerprint(
    data: FingerprintDataType,
    options?: FingerprintParseOptions,
    ignoreErrors: boolean = true
): Fingerprint {
    // Prepare the options
    options ??= {};
    options.type ??= "key";
    options.hashType ??= "ssh";
    // Check if data is undefined
    if (data == undefined) {
        // Check if errors should be ignored
        if (!ignoreErrors) {
            throw new Error("data is undefined");
        }
        return undefined as unknown as Fingerprint;
    }
    // Check if data is a Buffer
    if (Buffer.isBuffer(data)) {
        // Convert it to a string
        data = data.toString();
    }
    // Check if data is a string
    return parseFingerprintInternal(data, options);
}

export function writePublicOrPrivateKeyToString(
    key: Key | PrivateKey,
    format?: KeyFormatType,
    options?: WriteKeyOptions,
    ignoreErrors: boolean = true
): string {
    // Check if key is undefined
    if (key == undefined) {
        // Check if errors should be ignored
        if (!ignoreErrors) {
            throw new Error("key is undefined");
        }
        return undefined as unknown as string;
    }
    // Check if the key is a PrivateKey
    if (key instanceof PrivateKey) {
        return key.toString(format as PrivateKeyFormatType, options);
    }
    // Return the key
    return key.toString(format as PublicKeyFormatType, options);
}

export function writePublicOrPrivateKeyToBuffer(
    key: Key | PrivateKey,
    format?: KeyFormatType,
    options?: WriteKeyOptions,
    ignoreErrors: boolean = true
): Buffer {
    // Check if key is undefined
    if (key == undefined) {
        // Check if errors should be ignored
        if (!ignoreErrors) {
            throw new Error("key is undefined");
        }
        return undefined as unknown as Buffer;
    }
    // Check if the key is a PrivateKey
    if (key instanceof PrivateKey) {
        return key.toBuffer(format as PrivateKeyFormatType, options);
    }
    // Return the key
    return key.toBuffer(format as PublicKeyFormatType, options);
}

export function writeFingerprintToBuffer(
    fingerprint: Fingerprint,
    format?: "hex" | "base64",
    ignoreErrors: boolean = true
): Buffer {
    return Buffer.from(writeFingerprintToString(fingerprint, format, ignoreErrors));
}

export function writeFingerprintToString(
    fingerprint: Fingerprint,
    format?: "hex" | "base64",
    ignoreErrors: boolean = true
): string {
    // Check if fingerprint is undefined
    if (fingerprint == undefined) {
        // Check if errors should be ignored
        if (!ignoreErrors) {
            throw new Error("fingerprint is undefined");
        }
        return undefined as unknown as string;
    }
    return fingerprint.toString(format);
}

export interface CreateSyncHostVerifierOptions {
    format?: PublicKeyFormatType;
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

export async function createSSHConfig(
    entityManager: EntityManager,
    data: SSHConnectionData,
    debug?: DebugFunction
): Promise<Config> {
    if (data == null) {
        throw new Error("SSH connection data is null or undefined");
    } else if ("host" in data && !("id" in data)) {
        return data;
    } else if (!("sshConnectionId" in data) && !("id" in data)) {
        throw new Error(`Invalid SSH connection data provided 1: ${JSON.stringify(data)}`);
    }
    let sshConnection: SSHConnection | null;
    if ("sshConnectionId" in data) {
        sshConnection = await entityManager.findOne(SSHConnection, {
            where: { id: data.sshConnectionId },
            relations: { sshKeypair: true, remoteHostKeys: true },
            // lock: { mode: "pessimistic_read" }, // QueryFailedError: FOR SHARE cannot be applied to the nullable side of an outer join
        });
        if (!sshConnection) {
            throw new Error(`SSH connection with id ${JSON.stringify(data.sshConnectionId)} not found`);
        }
        if (!sshConnection.sshKeypair) {
            throw new Error(`SSH keypair for SSH connection with id ${JSON.stringify(data.sshConnectionId)} not found`);
        }
    } else if ("id" in data) {
        if (data.sshKeypair == null && data.sshKeypairId != null) {
            data.sshKeypair = await entityManager.findOne(SSHKeypair, {
                where: { id: data.sshKeypairId },
                lock: { mode: "pessimistic_read" },
            });
        }
        if (data.sshKeypair == null) {
            throw new Error(`SSH keypair for SSH connection with id ${JSON.stringify(data.id)} not found`);
        }
        if (data.remoteHostKeys == null) {
            data.remoteHostKeys = await entityManager.find(SSHKeypair, {
                where: { remoteHostConnections: { id: data.id } },
                lock: { mode: "pessimistic_read" },
            });
        }
        sshConnection = data;
    } else {
        throw new Error(`Invalid SSH connection data provided 2: ${JSON.stringify(data)}`);
    }
    // Create the config
    const config: Config = {
        host: sshConnection.host,
        port: sshConnection.port,
        username: sshConnection.username,
        password: sshConnection.password || undefined,
        privateKey: sshConnection.sshKeypair?.privateKey?.toString("openssh") || undefined,
        passphrase: sshConnection.sshKeypair?.passphrase || undefined,
    };
    // Check if the private key and password are undefined
    if (!config.privateKey && !config.password) {
        throw new Error("Either privateKey or password must be defined");
    }
    const remoteHostKeys: Key[] = sshConnection.remoteHostKeys?.map(remoteHostKey => remoteHostKey.publicKey) || [];
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

export async function useSSHConnection<R>(
    entityManager: EntityManager,
    connectionData: SSHConnectionData,
    callback: (client: NodeSSH) => Promise<R> | R
): Promise<R> {
    const config: Config = await createSSHConfig(entityManager, connectionData);
    const ssh: NodeSSH = new NodeSSH();
    await ssh.connect(config);
    try {
        return await callback(ssh);
    } finally {
        ssh.dispose();
    }
}

export async function useSFTPConnection<R>(
    entityManager: EntityManager,
    connectionData: SSHConnectionData,
    callback: (sftp: SFTPWrapper) => Promise<R> | R,
    defaultReturnValue: R = null
): Promise<R> {
    return useSSHConnection(entityManager, connectionData, async (ssh: NodeSSH): Promise<Promise<R> | R> => {
        let result: R = defaultReturnValue;
        await ssh.withSFTP(async (sftp: SFTPWrapper): Promise<void> => {
            result = await callback(sftp);
        });
        return result;
    });
}
