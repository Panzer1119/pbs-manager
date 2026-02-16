import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { MetadataEmbedding } from "../embeddings/metadata.embedding";
import { Host } from "./host.entity";
import { Namespace } from "./namespace.entity";
import { Group } from "./group.entity";
import { Snapshot } from "./snapshot.entity";
import { Archive } from "./archive.entity";
import { Chunk } from "./chunk.entity";
import { StatisticsEmbedding } from "../embeddings/statistics.embedding";

@Entity()
@Index(["host", "name"], { unique: true })
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

    @Column(() => StatisticsEmbedding)
    statistics!: StatisticsEmbedding;

    @Column(() => MetadataEmbedding)
    metadata!: MetadataEmbedding;

    @OneToMany(() => Namespace, namespace => namespace.datastore)
    namespaces?: Namespace[];

    @OneToMany(() => Group, group => group.datastore)
    groups?: Group[];

    @OneToMany(() => Snapshot, snapshot => snapshot.datastore)
    snapshots?: Snapshot[];

    @OneToMany(() => Archive, archive => archive.datastore)
    archives?: Archive[];

    @OneToMany(() => Chunk, chunk => chunk.datastore)
    chunks?: Chunk[];
}
