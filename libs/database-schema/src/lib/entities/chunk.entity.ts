import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { MetadataEmbedding } from "../embeddings/metadata.embedding";
import { Datastore } from "./datastore.entity";
import { BigIntTransformer } from "../transformers/bigint.transformer";
import { ArchiveChunk } from "./archive-chunk.entity";

@Entity()
@Index(["datastore", "hashSHA256"], { unique: true })
export class Chunk {
    @PrimaryGeneratedColumn("identity")
    id!: number;

    @Index()
    @Column()
    datastoreId!: number;

    @ManyToOne(() => Datastore, datastore => datastore.chunks, { onDelete: "CASCADE", onUpdate: "CASCADE" })
    @JoinColumn({ referencedColumnName: "id" })
    datastore?: Datastore;

    @Index()
    @Column({ length: 64 })
    hashSHA256!: string;

    @Index()
    @Column({ default: false })
    unused!: boolean;

    @Index()
    @Column("bigint", { nullable: true, transformer: new BigIntTransformer() })
    sizeBytes?: number;

    @Column(() => MetadataEmbedding)
    metadata!: MetadataEmbedding;

    @OneToMany(() => ArchiveChunk, archiveChunk => archiveChunk.chunk)
    archiveChunks?: ArchiveChunk[];
}
