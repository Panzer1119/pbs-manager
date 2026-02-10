import { Column, Entity, Index, ManyToMany, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { Fingerprint, Key, PrivateKey } from "sshpk";
import { MetadataEmbedding } from "../embeddings/metadata.embedding";
import { SSHConnection } from "./ssh-connection.entity";
import { SSHKeyAlgorithm } from "../types/ssh-key-algorithm.type";
import { SSHKeyFingerprintHashAlgorithm } from "../types/ssh-key-fingerprint-hash-algorithm.type";
import { SSHPrivateKeyFormat } from "../types/ssh-private-key-format.type";
import { SSHPublicKeyFormat } from "../types/ssh-public-key-format.type";
import { SSHKeyTransformer } from "../transformers/ssh-key.transformer";
import { SSHFingerprintTransformer } from "../transformers/ssh-fingerprint.transformer";

// Name, Algorithm
// Metadata Deletion IS NULL
@Index(["name"], { unique: true, where: '"algorithm" IS NULL AND "metadata_deletion" IS NULL' })
@Index(["name", "algorithm"], { unique: true, where: '"algorithm" IS NOT NULL AND "metadata_deletion" IS NULL' })
// Metadata Deletion IS NOT NULL
@Index(["name", "metadata.deletion"], {
    unique: true,
    where: '"algorithm" IS NULL AND "metadata_deletion" IS NOT NULL',
})
@Index(["name", "algorithm", "metadata.deletion"], {
    unique: true,
    where: '"algorithm" IS NOT NULL AND "metadata_deletion" IS NOT NULL',
})
@Entity()
export class SSHKeypair {
    @PrimaryGeneratedColumn("identity")
    id!: number;

    @Index()
    @Column({ length: 255 })
    name!: string;

    @Index()
    @Column({
        type: "simple-enum",
        enum: SSHKeyAlgorithm,
        enumName: "ssh_key_algorithm",
        nullable: true,
        default: null,
    })
    algorithm?: SSHKeyAlgorithm;

    @Index()
    @Column({
        type: "simple-enum",
        enum: SSHKeyFingerprintHashAlgorithm,
        enumName: "ssh_key_fingerprint_hash_algorithm",
        nullable: true,
        default: null,
    })
    fingerprintHashAlgorithm?: SSHKeyFingerprintHashAlgorithm;

    @Index()
    @Column({ type: "bytea", nullable: true })
    fingerprintHash?: Buffer;

    @Index()
    @Column({ type: "bytea", nullable: true, transformer: new SSHFingerprintTransformer() })
    fingerprint?: Fingerprint;

    @Index()
    @Column({ length: 255, nullable: true, default: null })
    privateKeyFile?: string;

    @Index()
    @Column({ length: 255, nullable: true, default: null })
    publicKeyFile?: string;

    @Index()
    @Column({
        type: "simple-enum",
        enum: SSHPrivateKeyFormat,
        enumName: "ssh_private_key_format",
        nullable: true,
        default: null,
    })
    privateKeyFormat?: SSHPrivateKeyFormat;

    @Index()
    @Column({
        type: "bytea",
        nullable: true,
        transformer: new SSHKeyTransformer({ privateKey: true, format: "openssh" }),
    })
    privateKey?: PrivateKey;

    @Column({ nullable: true })
    passphrase?: string;

    @Index()
    @Column({
        type: "simple-enum",
        enum: SSHPublicKeyFormat,
        enumName: "ssh_public_key_format",
        nullable: true,
        default: null,
    })
    publicKeyFormat?: SSHPublicKeyFormat;

    @Index()
    @Column({
        type: "bytea",
        nullable: true,
        transformer: new SSHKeyTransformer({ privateKey: false, format: "ssh" }),
    })
    publicKey?: Key;

    @Index()
    @Column({ nullable: true, default: true })
    active?: boolean;

    @Column(() => MetadataEmbedding)
    metadata!: MetadataEmbedding;

    @OneToMany(() => SSHConnection, sshConnection => sshConnection.sshKeypair)
    sshConnections?: SSHConnection[];

    @ManyToMany(() => SSHConnection, sshConnection => sshConnection.remoteHostKeys, {
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
    })
    remoteHostConnections?: SSHConnection[];
}
