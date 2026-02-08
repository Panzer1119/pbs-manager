import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSizeBytesAndChunkSizeBytesToArchive1770561947959 implements MigrationInterface {
    name = 'AddSizeBytesAndChunkSizeBytesToArchive1770561947959'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "archive"
            ADD "size_bytes" bigint
        `);
        await queryRunner.query(`
            ALTER TABLE "archive"
            ADD "chunk_size_bytes" bigint
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_0f63c1c4c9ab4a42c3cb5870f9" ON "archive" ("size_bytes")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_e72d20d384b162ece1f6492f05" ON "archive" ("chunk_size_bytes")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."IDX_e72d20d384b162ece1f6492f05"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_0f63c1c4c9ab4a42c3cb5870f9"
        `);
        await queryRunner.query(`
            ALTER TABLE "archive" DROP COLUMN "chunk_size_bytes"
        `);
        await queryRunner.query(`
            ALTER TABLE "archive" DROP COLUMN "size_bytes"
        `);
    }

}
