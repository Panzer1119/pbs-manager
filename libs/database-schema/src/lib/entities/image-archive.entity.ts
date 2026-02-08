import { ChildEntity, Column, Index } from "typeorm";
import { Archive } from "./archive.entity";
import { ArchiveType } from "../types/archive.type";
import { BigIntTransformer } from "../transformers/bigint.transformer";

@ChildEntity(ArchiveType.Image)
export class ImageArchive extends Archive {
    @Index()
    @Column("bigint", { transformer: new BigIntTransformer() })
    sizeBytes!: number;

    @Index()
    @Column("bigint", { transformer: new BigIntTransformer() })
    chunkSizeBytes!: number;
}
