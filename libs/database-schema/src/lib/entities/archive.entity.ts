import {
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
    TableInheritance,
} from "typeorm";
import { MetadataEmbedding } from "../embeddings/metadata.embedding";
import { ArchiveType } from "../types/archive.type";
import { Snapshot } from "./snapshot.entity";
import { ArchiveChunk } from "./archive-chunk.entity";
import { Datastore } from "./datastore.entity";

@Entity()
@Index(["snapshot", "type", "name"], { unique: true })
@TableInheritance({ column: { type: "simple-enum", enum: ArchiveType, enumName: "archive_type" } })
export class Archive {
    @PrimaryGeneratedColumn("identity")
    id!: number;

    @Column({ type: "simple-enum", enum: ArchiveType, enumName: "archive_type" })
    type!: ArchiveType;

    @Index()
    @Column()
    datastoreId!: number;

    @ManyToOne(() => Datastore, datastore => datastore.archives, { onDelete: "CASCADE", onUpdate: "CASCADE" })
    @JoinColumn({ referencedColumnName: "id" })
    datastore?: Datastore;

    @Index()
    @Column()
    snapshotId!: number;

    @ManyToOne(() => Snapshot, snapshot => snapshot.archives, {
        nullable: true,
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
    })
    @JoinColumn({ referencedColumnName: "id" })
    snapshot?: Snapshot;

    @Index()
    @Column({ length: 255 })
    name!: string;

    @Column("uuid", { nullable: true })
    uuid?: string;

    @Index()
    @Column("timestamptz", { nullable: true })
    creation?: Date;

    @Column({ length: 64, nullable: true })
    indexHashSHA256?: string;

    @Column(() => MetadataEmbedding)
    metadata!: MetadataEmbedding;

    @OneToMany(() => ArchiveChunk, archiveChunk => archiveChunk.archive)
    archiveChunks?: ArchiveChunk[];
}
