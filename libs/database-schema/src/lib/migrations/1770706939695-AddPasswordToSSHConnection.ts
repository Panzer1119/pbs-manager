import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPasswordToSSHConnection1770706939695 implements MigrationInterface {
    name = 'AddPasswordToSSHConnection1770706939695'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "ssh_connection"
            ADD "password" character varying
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "ssh_connection" DROP COLUMN "password"
        `);
    }

}
