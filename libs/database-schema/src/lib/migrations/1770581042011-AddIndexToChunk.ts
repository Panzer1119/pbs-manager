import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIndexToChunk1770581042011 implements MigrationInterface {
    name = 'AddIndexToChunk1770581042011'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE INDEX "IDX_451bdd03635bd4c902d6ab5817" ON "chunk" ("datastore_id")
            WHERE "metadata_deletion" IS NOT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."IDX_451bdd03635bd4c902d6ab5817"
        `);
    }

}
