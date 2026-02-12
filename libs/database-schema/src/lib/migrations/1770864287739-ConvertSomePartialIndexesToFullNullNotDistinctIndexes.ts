import { MigrationInterface, QueryRunner } from "typeorm";

export class ConvertSomePartialIndexesToFullNullNotDistinctIndexes1770864287739 implements MigrationInterface {
    name = "ConvertSomePartialIndexesToFullNullNotDistinctIndexes1770864287739";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."IDX_a8f1e9f90149cf735ba8eda59f"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_71f66026f61527204baec18663"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_50346f3e0119a8a66e108be9a1"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_47c20d9e321e164b1322b4329b"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_f99c8799458b781b70d29dbc4d"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_a6b99fee5f2f121cb5da578619"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_01c1f194d7927ebf4dd6dc4e1f"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_3a4cc68a95461d1d8351135577"
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_efa95ae6fa6b73027457b257bc" ON "group" (
                "datastore_id",
                "namespace_id",
                "type",
                "backup_id"
            )
            NULLS NOT DISTINCT
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_e9f6348e1c55e16bbda520f715" ON "namespace" ("datastore_id", "parent_id", "name") NULLS NOT DISTINCT
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."IDX_e9f6348e1c55e16bbda520f715"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_efa95ae6fa6b73027457b257bc"
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_3a4cc68a95461d1d8351135577" ON "namespace" ("datastore_id", "name")
            WHERE (
                    (parent_id IS NULL)
                    AND (metadata_deletion IS NULL)
                )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_01c1f194d7927ebf4dd6dc4e1f" ON "namespace" ("datastore_id", "parent_id", "name")
            WHERE (
                    (parent_id IS NOT NULL)
                    AND (metadata_deletion IS NULL)
                )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_a6b99fee5f2f121cb5da578619" ON "namespace" ("datastore_id", "name", "metadata_deletion")
            WHERE (
                    (parent_id IS NULL)
                    AND (metadata_deletion IS NOT NULL)
                )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_f99c8799458b781b70d29dbc4d" ON "namespace" (
                "datastore_id",
                "parent_id",
                "name",
                "metadata_deletion"
            )
            WHERE (
                    (parent_id IS NOT NULL)
                    AND (metadata_deletion IS NOT NULL)
                )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_47c20d9e321e164b1322b4329b" ON "group" ("datastore_id", "type", "backup_id")
            WHERE (
                    (namespace_id IS NULL)
                    AND (metadata_deletion IS NULL)
                )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_50346f3e0119a8a66e108be9a1" ON "group" (
                "datastore_id",
                "namespace_id",
                "type",
                "backup_id"
            )
            WHERE (
                    (namespace_id IS NOT NULL)
                    AND (metadata_deletion IS NULL)
                )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_71f66026f61527204baec18663" ON "group" (
                "datastore_id",
                "type",
                "backup_id",
                "metadata_deletion"
            )
            WHERE (
                    (namespace_id IS NULL)
                    AND (metadata_deletion IS NOT NULL)
                )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_a8f1e9f90149cf735ba8eda59f" ON "group" (
                "datastore_id",
                "namespace_id",
                "type",
                "backup_id",
                "metadata_deletion"
            )
            WHERE (
                    (namespace_id IS NOT NULL)
                    AND (metadata_deletion IS NOT NULL)
                )
        `);
    }
}
