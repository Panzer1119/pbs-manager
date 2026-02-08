import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from "typeorm";
import { Archive } from "./archive.entity";
import { Chunk } from "./chunk.entity";

@Entity()
export class ArchiveChunk {
    @PrimaryColumn()
    archiveId!: number;

    @ManyToOne(() => Archive, archive => archive.archiveChunks, {
        nullable: true,
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
    })
    @JoinColumn({ referencedColumnName: "id" })
    archive?: Archive;

    @PrimaryColumn()
    chunkId!: number;

    @ManyToOne(() => Chunk, chunk => chunk.archiveChunks, {
        nullable: true,
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
    })
    @JoinColumn({ referencedColumnName: "id" })
    chunk?: Chunk;

    @Index()
    @Column("int", { default: 1 })
    count!: number;
}
