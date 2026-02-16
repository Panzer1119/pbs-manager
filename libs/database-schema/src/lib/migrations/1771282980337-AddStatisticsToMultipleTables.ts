import { MigrationInterface, QueryRunner } from "typeorm";

export class AddStatisticsToMultipleTables1771282980337 implements MigrationInterface {
    name = 'AddStatisticsToMultipleTables1771282980337'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "archive"
            ADD "statistics_unique_size_bytes" bigint
        `);
        await queryRunner.query(`
            ALTER TABLE "archive"
            ADD "statistics_logical_size_bytes" bigint
        `);
        await queryRunner.query(`
            ALTER TABLE "archive"
            ADD "statistics_deduplication_ratio" double precision GENERATED ALWAYS AS (
                    CASE
                        WHEN statistics_logical_size_bytes > 0 THEN (
                            statistics_logical_size_bytes::double precision / statistics_unique_size_bytes
                        )
                        ELSE NULL
                    END
                ) STORED
        `);
        await queryRunner.query(`
            INSERT INTO "typeorm_metadata"(
                    "database",
                    "schema",
                    "table",
                    "type",
                    "name",
                    "value"
                )
            VALUES ($1, $2, $3, $4, $5, $6)
        `, ["pbs_manager_dev","public","archive","GENERATED_COLUMN","statistics_deduplication_ratio","CASE WHEN statistics_logical_size_bytes > 0 THEN (statistics_logical_size_bytes::double precision / statistics_unique_size_bytes) ELSE NULL END"]);
        await queryRunner.query(`
            ALTER TABLE "snapshot"
            ADD "statistics_unique_size_bytes" bigint
        `);
        await queryRunner.query(`
            ALTER TABLE "snapshot"
            ADD "statistics_logical_size_bytes" bigint
        `);
        await queryRunner.query(`
            ALTER TABLE "snapshot"
            ADD "statistics_deduplication_ratio" double precision GENERATED ALWAYS AS (
                    CASE
                        WHEN statistics_logical_size_bytes > 0 THEN (
                            statistics_logical_size_bytes::double precision / statistics_unique_size_bytes
                        )
                        ELSE NULL
                    END
                ) STORED
        `);
        await queryRunner.query(`
            INSERT INTO "typeorm_metadata"(
                    "database",
                    "schema",
                    "table",
                    "type",
                    "name",
                    "value"
                )
            VALUES ($1, $2, $3, $4, $5, $6)
        `, ["pbs_manager_dev","public","snapshot","GENERATED_COLUMN","statistics_deduplication_ratio","CASE WHEN statistics_logical_size_bytes > 0 THEN (statistics_logical_size_bytes::double precision / statistics_unique_size_bytes) ELSE NULL END"]);
        await queryRunner.query(`
            ALTER TABLE "group"
            ADD "statistics_unique_size_bytes" bigint
        `);
        await queryRunner.query(`
            ALTER TABLE "group"
            ADD "statistics_logical_size_bytes" bigint
        `);
        await queryRunner.query(`
            ALTER TABLE "group"
            ADD "statistics_deduplication_ratio" double precision GENERATED ALWAYS AS (
                    CASE
                        WHEN statistics_logical_size_bytes > 0 THEN (
                            statistics_logical_size_bytes::double precision / statistics_unique_size_bytes
                        )
                        ELSE NULL
                    END
                ) STORED
        `);
        await queryRunner.query(`
            INSERT INTO "typeorm_metadata"(
                    "database",
                    "schema",
                    "table",
                    "type",
                    "name",
                    "value"
                )
            VALUES ($1, $2, $3, $4, $5, $6)
        `, ["pbs_manager_dev","public","group","GENERATED_COLUMN","statistics_deduplication_ratio","CASE WHEN statistics_logical_size_bytes > 0 THEN (statistics_logical_size_bytes::double precision / statistics_unique_size_bytes) ELSE NULL END"]);
        await queryRunner.query(`
            ALTER TABLE "namespace"
            ADD "statistics_unique_size_bytes" bigint
        `);
        await queryRunner.query(`
            ALTER TABLE "namespace"
            ADD "statistics_logical_size_bytes" bigint
        `);
        await queryRunner.query(`
            ALTER TABLE "namespace"
            ADD "statistics_deduplication_ratio" double precision GENERATED ALWAYS AS (
                    CASE
                        WHEN statistics_logical_size_bytes > 0 THEN (
                            statistics_logical_size_bytes::double precision / statistics_unique_size_bytes
                        )
                        ELSE NULL
                    END
                ) STORED
        `);
        await queryRunner.query(`
            INSERT INTO "typeorm_metadata"(
                    "database",
                    "schema",
                    "table",
                    "type",
                    "name",
                    "value"
                )
            VALUES ($1, $2, $3, $4, $5, $6)
        `, ["pbs_manager_dev","public","namespace","GENERATED_COLUMN","statistics_deduplication_ratio","CASE WHEN statistics_logical_size_bytes > 0 THEN (statistics_logical_size_bytes::double precision / statistics_unique_size_bytes) ELSE NULL END"]);
        await queryRunner.query(`
            ALTER TABLE "datastore"
            ADD "statistics_unique_size_bytes" bigint
        `);
        await queryRunner.query(`
            ALTER TABLE "datastore"
            ADD "statistics_logical_size_bytes" bigint
        `);
        await queryRunner.query(`
            ALTER TABLE "datastore"
            ADD "statistics_deduplication_ratio" double precision GENERATED ALWAYS AS (
                    CASE
                        WHEN statistics_logical_size_bytes > 0 THEN (
                            statistics_logical_size_bytes::double precision / statistics_unique_size_bytes
                        )
                        ELSE NULL
                    END
                ) STORED
        `);
        await queryRunner.query(`
            INSERT INTO "typeorm_metadata"(
                    "database",
                    "schema",
                    "table",
                    "type",
                    "name",
                    "value"
                )
            VALUES ($1, $2, $3, $4, $5, $6)
        `, ["pbs_manager_dev","public","datastore","GENERATED_COLUMN","statistics_deduplication_ratio","CASE WHEN statistics_logical_size_bytes > 0 THEN (statistics_logical_size_bytes::double precision / statistics_unique_size_bytes) ELSE NULL END"]);
        await queryRunner.query(`
            CREATE INDEX "IDX_70ebdb51d4d5ceee8d8a486a28" ON "archive" ("statistics_unique_size_bytes")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_245e03fa90178eac11327cd7ef" ON "snapshot" ("statistics_unique_size_bytes")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_e7e9b32c1df94851c7b8861a13" ON "group" ("statistics_unique_size_bytes")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_bf4e554583c462cb9e9ebca0a2" ON "namespace" ("statistics_unique_size_bytes")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_7f86ceddf07d8404c5844d4596" ON "datastore" ("statistics_unique_size_bytes")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."IDX_7f86ceddf07d8404c5844d4596"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_bf4e554583c462cb9e9ebca0a2"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_e7e9b32c1df94851c7b8861a13"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_245e03fa90178eac11327cd7ef"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_70ebdb51d4d5ceee8d8a486a28"
        `);
        await queryRunner.query(`
            DELETE FROM "typeorm_metadata"
            WHERE "type" = $1
                AND "name" = $2
                AND "database" = $3
                AND "schema" = $4
                AND "table" = $5
        `, ["GENERATED_COLUMN","statistics_deduplication_ratio","pbs_manager_dev","public","datastore"]);
        await queryRunner.query(`
            ALTER TABLE "datastore" DROP COLUMN "statistics_deduplication_ratio"
        `);
        await queryRunner.query(`
            ALTER TABLE "datastore" DROP COLUMN "statistics_logical_size_bytes"
        `);
        await queryRunner.query(`
            ALTER TABLE "datastore" DROP COLUMN "statistics_unique_size_bytes"
        `);
        await queryRunner.query(`
            DELETE FROM "typeorm_metadata"
            WHERE "type" = $1
                AND "name" = $2
                AND "database" = $3
                AND "schema" = $4
                AND "table" = $5
        `, ["GENERATED_COLUMN","statistics_deduplication_ratio","pbs_manager_dev","public","namespace"]);
        await queryRunner.query(`
            ALTER TABLE "namespace" DROP COLUMN "statistics_deduplication_ratio"
        `);
        await queryRunner.query(`
            ALTER TABLE "namespace" DROP COLUMN "statistics_logical_size_bytes"
        `);
        await queryRunner.query(`
            ALTER TABLE "namespace" DROP COLUMN "statistics_unique_size_bytes"
        `);
        await queryRunner.query(`
            DELETE FROM "typeorm_metadata"
            WHERE "type" = $1
                AND "name" = $2
                AND "database" = $3
                AND "schema" = $4
                AND "table" = $5
        `, ["GENERATED_COLUMN","statistics_deduplication_ratio","pbs_manager_dev","public","group"]);
        await queryRunner.query(`
            ALTER TABLE "group" DROP COLUMN "statistics_deduplication_ratio"
        `);
        await queryRunner.query(`
            ALTER TABLE "group" DROP COLUMN "statistics_logical_size_bytes"
        `);
        await queryRunner.query(`
            ALTER TABLE "group" DROP COLUMN "statistics_unique_size_bytes"
        `);
        await queryRunner.query(`
            DELETE FROM "typeorm_metadata"
            WHERE "type" = $1
                AND "name" = $2
                AND "database" = $3
                AND "schema" = $4
                AND "table" = $5
        `, ["GENERATED_COLUMN","statistics_deduplication_ratio","pbs_manager_dev","public","snapshot"]);
        await queryRunner.query(`
            ALTER TABLE "snapshot" DROP COLUMN "statistics_deduplication_ratio"
        `);
        await queryRunner.query(`
            ALTER TABLE "snapshot" DROP COLUMN "statistics_logical_size_bytes"
        `);
        await queryRunner.query(`
            ALTER TABLE "snapshot" DROP COLUMN "statistics_unique_size_bytes"
        `);
        await queryRunner.query(`
            DELETE FROM "typeorm_metadata"
            WHERE "type" = $1
                AND "name" = $2
                AND "database" = $3
                AND "schema" = $4
                AND "table" = $5
        `, ["GENERATED_COLUMN","statistics_deduplication_ratio","pbs_manager_dev","public","archive"]);
        await queryRunner.query(`
            ALTER TABLE "archive" DROP COLUMN "statistics_deduplication_ratio"
        `);
        await queryRunner.query(`
            ALTER TABLE "archive" DROP COLUMN "statistics_logical_size_bytes"
        `);
        await queryRunner.query(`
            ALTER TABLE "archive" DROP COLUMN "statistics_unique_size_bytes"
        `);
    }

}
