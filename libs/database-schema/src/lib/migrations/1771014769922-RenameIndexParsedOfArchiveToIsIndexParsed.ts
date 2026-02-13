import { MigrationInterface, QueryRunner } from "typeorm";

export class RenameIndexParsedOfArchiveToIsIndexParsed1771014769922 implements MigrationInterface {
    name = 'RenameIndexParsedOfArchiveToIsIndexParsed1771014769922'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."IDX_deb80c4e57916ac7916531d75b"
        `);
        await queryRunner.query(`
            ALTER TABLE "archive"
                RENAME COLUMN "index_parsed" TO "is_index_parsed"
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_c19bfbde4c6836963dcd5ee06c" ON "archive" ("is_index_parsed")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."IDX_c19bfbde4c6836963dcd5ee06c"
        `);
        await queryRunner.query(`
            ALTER TABLE "archive"
                RENAME COLUMN "is_index_parsed" TO "index_parsed"
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_deb80c4e57916ac7916531d75b" ON "archive" ("index_parsed")
        `);
    }

}
