import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { MetadataEmbedding } from "../embeddings/metadata.embedding";
import { Group } from "./group.entity";
import { Archive } from "./archive.entity";
import { Datastore } from "./datastore.entity";

@Entity()
@Index(["group", "time"], { unique: true, where: '"metadata_deletion" IS NULL' })
@Index(["group", "time", "metadata.deletion"], { unique: true, where: '"metadata_deletion" IS NOT NULL' })
export class Snapshot {
    @PrimaryGeneratedColumn("identity")
    id!: number;

    @Index()
    @Column()
    datastoreId!: number;

    @ManyToOne(() => Datastore, datastore => datastore.snapshots, { onDelete: "CASCADE", onUpdate: "CASCADE" })
    @JoinColumn({ referencedColumnName: "id" })
    datastore?: Datastore;

    @Index()
    @Column()
    groupId!: number;

    @ManyToOne(() => Group, group => group.snapshots, {
        nullable: true,
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
    })
    @JoinColumn({ referencedColumnName: "id" })
    group?: Group;

    @Index()
    @Column("timestamptz")
    time!: Date;

    @Column(() => MetadataEmbedding)
    metadata!: MetadataEmbedding;

    @OneToMany(() => Archive, archive => archive.snapshot)
    archives?: Archive[];
}
