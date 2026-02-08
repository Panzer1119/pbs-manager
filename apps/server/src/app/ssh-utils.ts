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
import { DebugFunction, SyncHostVerifier } from "ssh2";
import { Config, NodeSSH, SSHExecOptions } from "node-ssh";
import { Logger } from "@nestjs/common";
import { EntityManager } from "typeorm";
import { SSHConnection } from "@pbs-manager/database-schema";

export type KeyFormatType = PublicKeyFormatType | PrivateKeyFormatType;
export type ParseKeyOptions = string | (Format.ReadOptions & { filename?: string });
export type WriteKeyOptions = Format.WriteOptions;
export type KeyDataType = string | Buffer;
export type FingerprintDataType = string | Buffer;
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
        privateKey: privateKey?.toString("openssh"),
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

export async function useSSHConnection<R>(
    entityManager: EntityManager,
    connection: SSHConnectionData,
    options: SSHExecOptions,
    callback: (client: NodeSSH, options?: SSHExecOptions) => Promise<R> | R
): Promise<R> {
    let config: Config | undefined;
    if ("sshConnectionId" in connection) {
        const sshConnection: SSHConnection | undefined = await entityManager.findOne(SSHConnection, {
            where: { id: connection.sshConnectionId },
            // relations: { sshKeypair: true, remoteHostKeys: true },
            relations: { sshKeypair: true },
        });
        if (!sshConnection) {
            throw new Error(`SSH connection with id ${JSON.stringify(connection.sshConnectionId)} not found`);
        }
        if (!sshConnection.sshKeypair) {
            throw new Error(
                `SSH keypair for SSH connection with id ${JSON.stringify(connection.sshConnectionId)} not found`
            );
        }
        config = createSSHConfig(
            sshConnection.host,
            sshConnection.port,
            sshConnection.username,
            sshConnection.sshKeypair?.privateKey,
            sshConnection.remoteHostKeys?.map(remoteHostKey => remoteHostKey.publicKey)
        );
    } else if ("host" in connection && "port" in connection && "username" in connection && "privateKey" in connection) {
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
