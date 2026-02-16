import { Column, Index } from "typeorm";
import { BigIntTransformer } from "../transformers/bigint.transformer";

export class StatisticsEmbedding {
    @Index()
    @Column("bigint", { nullable: true, transformer: new BigIntTransformer() })
    uniqueSizeBytes?: number;

    @Column("bigint", { nullable: true, transformer: new BigIntTransformer() })
    logicalSizeBytes?: number;

    @Column({
        type: "double precision",
        nullable: true,
        insert: false,
        update: false,
        generatedType: "STORED",
        asExpression:
            "CASE WHEN logical_size_bytes > 0 THEN (logical_size_bytes::double precision / unique_size_bytes) ELSE NULL END",
    })
    deduplicationRatio?: number;
}
