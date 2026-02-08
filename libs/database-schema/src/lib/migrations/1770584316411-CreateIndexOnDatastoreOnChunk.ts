import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateIndexOnDatastoreOnChunk1770584316411 implements MigrationInterface {
    name = 'CreateIndexOnDatastoreOnChunk1770584316411'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE INDEX "IDX_770bafb8b0cdabe5acd370491e" ON "chunk" ("datastore_id")
            WHERE "metadata_deletion" IS NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."IDX_770bafb8b0cdabe5acd370491e"
        `);
    }

}
