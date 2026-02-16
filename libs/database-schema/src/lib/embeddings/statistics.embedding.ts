import { Column, Index } from "typeorm";
import { BigIntTransformer } from "../transformers/bigint.transformer";

export class StatisticsEmbedding {
    @Index()
    @Column({ type: "timestamptz", nullable: true })
    calculatedAt?: Date;

    @Index()
    @Column("bigint", { nullable: true, transformer: new BigIntTransformer() })
    uniqueSizeBytes?: number;

    @Column("bigint", { nullable: true, transformer: new BigIntTransformer() })
    logicalSizeBytes?: number;

    @Column({
        type: "double precision",
        nullable: true,
        //FIXME When this is a generated column, saving multiple entities results in a "column "statistics_deduplication_ratio" can only be updated to DEFAULT",
        // because it tries to update the generated column with the default value in the "DO UPDATE" part of the upsert query, which is not allowed for generated columns.
        // insert: false,
        // update: false,
        // generatedType: "STORED",
        // asExpression:
        //     "CASE WHEN statistics_logical_size_bytes > 0 THEN (statistics_logical_size_bytes::double precision / statistics_unique_size_bytes) ELSE NULL END",
    })
    deduplicationRatio?: number;
}
