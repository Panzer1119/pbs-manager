import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { MetadataEmbedding } from "../embeddings/metadata.embedding";
import { Host } from "./host.entity";

@Entity()
@Index(["host", "name"], { unique: true, where: '"metadata_deletion" IS NULL' })
@Index(["host", "name", "metadata.deletion"], { unique: true, where: '"metadata_deletion" IS NOT NULL' })
export class Datastore {
    @PrimaryGeneratedColumn("identity")
    id!: number;

    @Index()
    @Column({ nullable: true })
    hostId?: number;

    @ManyToOne(() => Host, host => host.datastores, { nullable: true, onDelete: "CASCADE", onUpdate: "CASCADE" })
    @JoinColumn({ referencedColumnName: "id" })
    host?: Host;

    @Index()
    @Column({ length: 255 })
    name!: string;

    @Column({ length: 255, nullable: true })
    mountpoint?: string;

    @Column(() => MetadataEmbedding)
    metadata!: MetadataEmbedding;

    // @OneToMany(() => Group, group => group.datastore)
    // groups?: Group[];

    // @OneToMany(() => Namespace, namespace => namespace.datastore)
    // namespaces?: Namespace[];

    // @OneToMany(() => Chunk, chunk => chunk.datastore)
    // chunks?: Chunk[];
}
