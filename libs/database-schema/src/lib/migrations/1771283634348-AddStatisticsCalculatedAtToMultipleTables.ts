import { MigrationInterface, QueryRunner } from "typeorm";

export class AddStatisticsCalculatedAtToMultipleTables1771283634348 implements MigrationInterface {
    name = 'AddStatisticsCalculatedAtToMultipleTables1771283634348'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "archive"
            ADD "statistics_calculated_at" TIMESTAMP WITH TIME ZONE
        `);
        await queryRunner.query(`
            ALTER TABLE "snapshot"
            ADD "statistics_calculated_at" TIMESTAMP WITH TIME ZONE
        `);
        await queryRunner.query(`
            ALTER TABLE "group"
            ADD "statistics_calculated_at" TIMESTAMP WITH TIME ZONE
        `);
        await queryRunner.query(`
            ALTER TABLE "datastore"
            ADD "statistics_calculated_at" TIMESTAMP WITH TIME ZONE
        `);
        await queryRunner.query(`
            ALTER TABLE "namespace"
            ADD "statistics_calculated_at" TIMESTAMP WITH TIME ZONE
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_e52096bf523b0729b7f2a47266" ON "archive" ("statistics_calculated_at")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_6e938b8ea4e0170baf9e8ebd4f" ON "snapshot" ("statistics_calculated_at")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_37b4e7ee50726c861ad458abb3" ON "group" ("statistics_calculated_at")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_502e0e8c45f14ed5d65b59e697" ON "datastore" ("statistics_calculated_at")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_c70944976fb3e0081b144dc5a5" ON "namespace" ("statistics_calculated_at")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."IDX_c70944976fb3e0081b144dc5a5"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_502e0e8c45f14ed5d65b59e697"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_37b4e7ee50726c861ad458abb3"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_6e938b8ea4e0170baf9e8ebd4f"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_e52096bf523b0729b7f2a47266"
        `);
        await queryRunner.query(`
            ALTER TABLE "namespace" DROP COLUMN "statistics_calculated_at"
        `);
        await queryRunner.query(`
            ALTER TABLE "datastore" DROP COLUMN "statistics_calculated_at"
        `);
        await queryRunner.query(`
            ALTER TABLE "group" DROP COLUMN "statistics_calculated_at"
        `);
        await queryRunner.query(`
            ALTER TABLE "snapshot" DROP COLUMN "statistics_calculated_at"
        `);
        await queryRunner.query(`
            ALTER TABLE "archive" DROP COLUMN "statistics_calculated_at"
        `);
    }

}
