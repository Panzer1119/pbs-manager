import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIsMissingChunksToArchive1771014699700 implements MigrationInterface {
    name = 'AddIsMissingChunksToArchive1771014699700'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "archive"
            ADD "is_missing_chunks" boolean
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_51e2ffbcd14bcd41b8af87aae3" ON "archive" ("is_missing_chunks")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."IDX_51e2ffbcd14bcd41b8af87aae3"
        `);
        await queryRunner.query(`
            ALTER TABLE "archive" DROP COLUMN "is_missing_chunks"
        `);
    }

}
