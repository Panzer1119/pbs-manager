import { ValueTransformer } from "typeorm";
import {
    Format,
    Key,
    KeyFormatType as PublicKeyFormatType,
    parseKey as parsePublicKey,
    parsePrivateKey,
    PrivateKey,
    PrivateKeyFormatType,
} from "sshpk";

export type KeyFormatType = PublicKeyFormatType | PrivateKeyFormatType;
export type ParseKeyOptions = string | (Format.ReadOptions & { filename?: string });
export type WriteKeyOptions = Format.WriteOptions;
export type KeyDataType = string | Buffer;

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

export const DEFAULT_DATABASE_SSH_KEY_FORMAT: PublicKeyFormatType & PrivateKeyFormatType = "openssh";

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

export class SSHKeyTransformer implements ValueTransformer {
    constructor(private readonly options?: SSHKeyTransformerOptions) {}

    from(data?: KeyDataType): Key | PrivateKey | undefined {
        // Check if data is undefined
        if (data == undefined) {
            return undefined;
        }
        let format: KeyFormatType = "auto";
        if (this.options?.useFormatForParsing && this.options?.format != undefined) {
            format = this.options.format;
        }
        // Parse the key
        return parsePublicOrPrivateKey(data, !!this.options?.privateKey, format, this.options?.parseKeyOptions, false);
    }

    to(key?: Key | PrivateKey): Buffer | undefined {
        // Check if key is undefined
        if (key == undefined) {
            return undefined;
        }
        // Write the key
        return writePublicOrPrivateKeyToBuffer(
            key,
            this.options?.format || DEFAULT_DATABASE_SSH_KEY_FORMAT,
            this.options?.writeKeyOptions,
            false
        );
    }
}
