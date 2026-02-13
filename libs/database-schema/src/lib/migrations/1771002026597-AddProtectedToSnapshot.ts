import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProtectedToSnapshot1771002026597 implements MigrationInterface {
    name = 'AddProtectedToSnapshot1771002026597'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "snapshot"
            ADD "protected" boolean
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "snapshot" DROP COLUMN "protected"
        `);
    }

}
