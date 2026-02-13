import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIndexParsedToArchive1771001621849 implements MigrationInterface {
    name = 'AddIndexParsedToArchive1771001621849'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "archive"
            ADD "index_parsed" boolean DEFAULT false
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_deb80c4e57916ac7916531d75b" ON "archive" ("index_parsed")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."IDX_deb80c4e57916ac7916531d75b"
        `);
        await queryRunner.query(`
            ALTER TABLE "archive" DROP COLUMN "index_parsed"
        `);
    }

}
