import { Column, Entity, Index, JoinColumn, OneToOne, PrimaryGeneratedColumn } from "typeorm";
import { MetadataEmbedding } from "../embeddings/metadata.embedding";
import { HostAddress } from "./host-address.entity";

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

    @Column(() => MetadataEmbedding)
    metadata!: MetadataEmbedding;
}
