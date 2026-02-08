import { MigrationInterface, QueryRunner } from "typeorm";

export class AddExistsToChunk1770580026821 implements MigrationInterface {
    name = 'AddExistsToChunk1770580026821'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "chunk"
            ADD "exists" boolean NOT NULL DEFAULT true
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_ecc151ec9057cbd35fb502433c" ON "chunk" ("exists")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."IDX_ecc151ec9057cbd35fb502433c"
        `);
        await queryRunner.query(`
            ALTER TABLE "chunk" DROP COLUMN "exists"
        `);
    }

}
