import { Column, Entity, Index, JoinColumn, JoinTable, ManyToMany, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { MetadataEmbedding } from "../embeddings/metadata.embedding";
import { SSHKeypair } from "./ssh-keypair.entity";
import { Host } from "./host.entity";

@Entity()
export class SSHConnection {
    @PrimaryGeneratedColumn("identity")
    id!: number;

    @Index({ unique: true })
    @Column({ length: 255 })
    name!: string;

    @Index()
    @Column({ length: 255 })
    host!: string;

    @Index()
    @Column({ nullable: true, default: 22 })
    port?: number;

    @Index()
    @Column({ length: 255 })
    username!: string;

    @Column({ nullable: true })
    password?: string;

    @Index()
    @Column()
    sshKeypairId!: number;

    @ManyToOne(() => SSHKeypair, sshKeypair => sshKeypair.sshConnections, { onDelete: "CASCADE", onUpdate: "CASCADE" })
    @JoinColumn({ referencedColumnName: "id" })
    sshKeypair?: SSHKeypair;

    @ManyToMany(() => SSHKeypair, sshKeypair => sshKeypair.remoteHostConnections, {
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
    })
    @JoinTable({ name: "ssh_connection_remote_host_keys" })
    remoteHostKeys?: SSHKeypair[];

    @Index()
    @Column({ nullable: true, default: true })
    active?: boolean;

    @Column(() => MetadataEmbedding)
    metadata!: MetadataEmbedding;

    @ManyToMany(() => Host, host => host.sshConnections, {
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
    })
    hosts?: Host[];
}
