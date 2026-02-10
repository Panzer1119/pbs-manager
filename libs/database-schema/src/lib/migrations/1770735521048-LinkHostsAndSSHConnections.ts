import { MigrationInterface, QueryRunner } from "typeorm";

export class LinkHostsAndSSHConnections1770735521048 implements MigrationInterface {
    name = 'LinkHostsAndSSHConnections1770735521048'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "host_ssh_connections" (
                "host_id" integer NOT NULL,
                "ssh_connection_id" integer NOT NULL,
                CONSTRAINT "PK_6dd36c7e9c36b2a476d5f27dedf" PRIMARY KEY ("host_id", "ssh_connection_id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_6340eabddbcce2e0cf5177d898" ON "host_ssh_connections" ("host_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_19a4b621e3f818895b54c6ccde" ON "host_ssh_connections" ("ssh_connection_id")
        `);
        await queryRunner.query(`
            ALTER TABLE "host_ssh_connections"
            ADD CONSTRAINT "FK_6340eabddbcce2e0cf5177d898f" FOREIGN KEY ("host_id") REFERENCES "host"("id") ON DELETE CASCADE ON UPDATE CASCADE
        `);
        await queryRunner.query(`
            ALTER TABLE "host_ssh_connections"
            ADD CONSTRAINT "FK_19a4b621e3f818895b54c6ccde9" FOREIGN KEY ("ssh_connection_id") REFERENCES "ssh_connection"("id") ON DELETE CASCADE ON UPDATE CASCADE
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "host_ssh_connections" DROP CONSTRAINT "FK_19a4b621e3f818895b54c6ccde9"
        `);
        await queryRunner.query(`
            ALTER TABLE "host_ssh_connections" DROP CONSTRAINT "FK_6340eabddbcce2e0cf5177d898f"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_19a4b621e3f818895b54c6ccde"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_6340eabddbcce2e0cf5177d898"
        `);
        await queryRunner.query(`
            DROP TABLE "host_ssh_connections"
        `);
    }

}
