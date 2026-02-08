import { Column, Entity, Index, JoinColumn, OneToOne, PrimaryGeneratedColumn } from "typeorm";
import { MetadataEmbedding } from "../embeddings/metadata.embedding";
import { Host } from "./host.entity";

@Entity()
export class HostAddress {
    @PrimaryGeneratedColumn("identity")
    id!: number;

    @Index()
    @Column()
    hostId!: number;

    @OneToOne(() => Host, host => host.address)
    @JoinColumn({ referencedColumnName: "id", name: "host_id" })
    hostEntity!: Host;

    @Index()
    @Column({ length: 31, default: "http" })
    scheme!: string;

    @Index()
    @Column({ length: 255, nullable: true })
    userInfo?: string;

    @Index()
    @Column({ length: 255, default: "localhost" })
    host!: string;

    @Index()
    @Column({ length: 1023, nullable: true })
    path?: string;

    @Index()
    @Column({ nullable: true, default: true })
    active?: boolean;

    @Column(() => MetadataEmbedding)
    metadata!: MetadataEmbedding;
}
