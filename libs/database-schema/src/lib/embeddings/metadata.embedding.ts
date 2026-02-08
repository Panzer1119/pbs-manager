import { CreateDateColumn, DeleteDateColumn, Index, UpdateDateColumn, VersionColumn } from "typeorm";

export class MetadataEmbedding {
    @Index()
    @CreateDateColumn({ type: "timestamptz" })
    creation!: Date;

    @Index()
    @UpdateDateColumn({ type: "timestamptz" })
    update!: Date;

    @Index({ where: '"metadata_deletion" IS NULL' })
    @DeleteDateColumn({ type: "timestamptz" })
    deletion?: Date;

    @VersionColumn({ type: "int", default: 1 })
    version!: number;
}
