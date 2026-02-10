import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPassphraseToSSHKeyPair1770707113080 implements MigrationInterface {
    name = 'AddPassphraseToSSHKeyPair1770707113080'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "ssh_keypair"
            ADD "passphrase" character varying
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "ssh_keypair" DROP COLUMN "passphrase"
        `);
    }

}
