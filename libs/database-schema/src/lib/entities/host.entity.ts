import {
    Column,
    Entity,
    Index,
    JoinColumn,
    JoinTable,
    ManyToMany,
    OneToMany,
    OneToOne,
    PrimaryGeneratedColumn,
} from "typeorm";
import { MetadataEmbedding } from "../embeddings/metadata.embedding";
import { HostAddress } from "./host-address.entity";
import { Datastore } from "./datastore.entity";
import { SSHConnection } from "./ssh-connection.entity";

@Entity()
export class Host {
    @PrimaryGeneratedColumn("identity")
    id!: number;

    @Index({ unique: true })
    @Column({ length: 255 })
    name!: string;

    @Index()
    @Column({ nullable: true, default: true })
    active?: boolean;

    @OneToOne(() => HostAddress, hostAddress => hostAddress.host)
    @JoinColumn()
    address?: HostAddress;

    @ManyToMany(() => SSHConnection, sshConnection => sshConnection.hosts, {
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
    })
    @JoinTable({ name: "host_ssh_connections" })
    sshConnections?: SSHConnection[];

    @Column(() => MetadataEmbedding)
    metadata!: MetadataEmbedding;

    @OneToMany(() => Datastore, datastore => datastore.host)
    datastores?: Datastore[];
}
