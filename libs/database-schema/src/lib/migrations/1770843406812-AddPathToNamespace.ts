import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPathToNamespace1770843406812 implements MigrationInterface {
    name = 'AddPathToNamespace1770843406812'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "namespace"
            ADD "path" character varying(4095)
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_2a14d3449378c0f6f7a198b741" ON "namespace" ("path")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."IDX_2a14d3449378c0f6f7a198b741"
        `);
        await queryRunner.query(`
            ALTER TABLE "namespace" DROP COLUMN "path"
        `);
    }

}
