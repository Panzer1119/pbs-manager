import { ValueTransformer } from "typeorm";
import { Fingerprint, FingerprintParseOptions, parseFingerprint as parseFingerprintInternal } from "sshpk";

export type FingerprintDataType = string | Buffer;
export type SSHFingerprintTransformerOptions = {
    format?: "hex" | "base64";
    fingerprintParseOptions?: FingerprintParseOptions;
};

export const DEFAULT_DATABASE_SSH_FINGERPRINT_FORMAT: "hex" | "base64" = "base64";

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

export class SSHFingerprintTransformer implements ValueTransformer {
    constructor(private readonly options?: SSHFingerprintTransformerOptions) {}

    from(data?: FingerprintDataType): Fingerprint | undefined {
        // Check if data is undefined
        if (data == undefined) {
            return undefined;
        }
        // Parse the fingerprint
        return parseFingerprint(data, this.options?.fingerprintParseOptions);
    }

    to(fingerprint?: Fingerprint): Buffer | undefined {
        // Check if fingerprint is undefined
        if (fingerprint == undefined) {
            return undefined;
        }
        // Write the key
        return writeFingerprintToBuffer(fingerprint, DEFAULT_DATABASE_SSH_FINGERPRINT_FORMAT, false);
    }
}
