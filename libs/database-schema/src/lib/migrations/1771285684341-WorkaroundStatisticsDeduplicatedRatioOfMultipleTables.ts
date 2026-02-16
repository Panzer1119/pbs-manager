import { MigrationInterface, QueryRunner } from "typeorm";

export class WorkaroundStatisticsDeduplicatedRatioOfMultipleTables1771285684341 implements MigrationInterface {
    name = 'WorkaroundStatisticsDeduplicatedRatioOfMultipleTables1771285684341'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "archive"
                RENAME COLUMN "statistics_deduplication_ratio" TO "TEMP_OLD_statistics_deduplication_ratio"
        `);
        await queryRunner.query(`
            ALTER TABLE "archive"
            ADD "statistics_deduplication_ratio" double precision
        `);
        await queryRunner.query(`
            UPDATE "archive"
            SET "statistics_deduplication_ratio" = "TEMP_OLD_statistics_deduplication_ratio"
        `);
        await queryRunner.query(`
            ALTER TABLE "archive" DROP COLUMN "TEMP_OLD_statistics_deduplication_ratio"
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
            ALTER TABLE "snapshot"
                RENAME COLUMN "statistics_deduplication_ratio" TO "TEMP_OLD_statistics_deduplication_ratio"
        `);
        await queryRunner.query(`
            ALTER TABLE "snapshot"
            ADD "statistics_deduplication_ratio" double precision
        `);
        await queryRunner.query(`
            UPDATE "snapshot"
            SET "statistics_deduplication_ratio" = "TEMP_OLD_statistics_deduplication_ratio"
        `);
        await queryRunner.query(`
            ALTER TABLE "snapshot" DROP COLUMN "TEMP_OLD_statistics_deduplication_ratio"
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
            ALTER TABLE "group"
                RENAME COLUMN "statistics_deduplication_ratio" TO "TEMP_OLD_statistics_deduplication_ratio"
        `);
        await queryRunner.query(`
            ALTER TABLE "group"
            ADD "statistics_deduplication_ratio" double precision
        `);
        await queryRunner.query(`
            UPDATE "group"
            SET "statistics_deduplication_ratio" = "TEMP_OLD_statistics_deduplication_ratio"
        `);
        await queryRunner.query(`
            ALTER TABLE "group" DROP COLUMN "TEMP_OLD_statistics_deduplication_ratio"
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
            ALTER TABLE "namespace"
                RENAME COLUMN "statistics_deduplication_ratio" TO "TEMP_OLD_statistics_deduplication_ratio"
        `);
        await queryRunner.query(`
            ALTER TABLE "namespace"
            ADD "statistics_deduplication_ratio" double precision
        `);
        await queryRunner.query(`
            UPDATE "namespace"
            SET "statistics_deduplication_ratio" = "TEMP_OLD_statistics_deduplication_ratio"
        `);
        await queryRunner.query(`
            ALTER TABLE "namespace" DROP COLUMN "TEMP_OLD_statistics_deduplication_ratio"
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
            ALTER TABLE "datastore"
                RENAME COLUMN "statistics_deduplication_ratio" TO "TEMP_OLD_statistics_deduplication_ratio"
        `);
        await queryRunner.query(`
            ALTER TABLE "datastore"
            ADD "statistics_deduplication_ratio" double precision
        `);
        await queryRunner.query(`
            UPDATE "datastore"
            SET "statistics_deduplication_ratio" = "TEMP_OLD_statistics_deduplication_ratio"
        `);
        await queryRunner.query(`
            ALTER TABLE "datastore" DROP COLUMN "TEMP_OLD_statistics_deduplication_ratio"
        `);
        await queryRunner.query(`
            DELETE FROM "typeorm_metadata"
            WHERE "type" = $1
                AND "name" = $2
                AND "database" = $3
                AND "schema" = $4
                AND "table" = $5
        `, ["GENERATED_COLUMN","statistics_deduplication_ratio","pbs_manager_dev","public","datastore"]);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "datastore" DROP COLUMN "statistics_deduplication_ratio"
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
            ALTER TABLE "namespace" DROP COLUMN "statistics_deduplication_ratio"
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
            ALTER TABLE "group" DROP COLUMN "statistics_deduplication_ratio"
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
            ALTER TABLE "snapshot" DROP COLUMN "statistics_deduplication_ratio"
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
            ALTER TABLE "archive" DROP COLUMN "statistics_deduplication_ratio"
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
    }

}
