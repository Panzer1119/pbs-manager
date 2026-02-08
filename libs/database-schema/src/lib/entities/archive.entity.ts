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

@Entity()
@Index(["snapshot", "type", "name"], { unique: true, where: '"metadata_deletion" IS NULL' })
@Index(["snapshot", "type", "name", "metadata.deletion"], { unique: true, where: '"metadata_deletion" IS NOT NULL' })
@TableInheritance({ column: { type: "simple-enum", enum: ArchiveType, enumName: "archive_type" } })
export class Archive {
    @PrimaryGeneratedColumn("identity")
    id!: number;

    @Column({ type: "simple-enum", enum: ArchiveType, enumName: "archive_type" })
    type!: ArchiveType;

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
