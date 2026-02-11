import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDatastoreToGroupAndArchive1770844617181 implements MigrationInterface {
    name = 'AddDatastoreToGroupAndArchive1770844617181'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "archive"
            ADD "datastore_id" integer
        `);
        await queryRunner.query(`
            ALTER TABLE "snapshot"
            ADD "datastore_id" integer
        `);
        // Each group has a datastore_id, so we can set the datastore_id to the datastore_id of its group
        await queryRunner.query(`
            UPDATE "snapshot" s
            SET "datastore_id" = (SELECT "datastore_id"
                                  FROM "group" g
                                  WHERE g.id = s.group_id)
        `);
        // And now we can set the datastore_id of the archive to the datastore_id of its snapshot
        await queryRunner.query(`
            UPDATE "archive" a
            SET "datastore_id" = (SELECT "datastore_id"
                                  FROM "snapshot" s
                                  WHERE s.id = a.snapshot_id)
        `);
        await queryRunner.query(`
            ALTER TABLE "archive"
            ALTER COLUMN "datastore_id"
            SET NOT NULL
        `);
        await queryRunner.query(`
            ALTER TABLE "snapshot"
            ALTER COLUMN "datastore_id"
            SET NOT NULL
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_c4e88c904cf036e5ed64169de5" ON "archive" ("datastore_id")
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_ea42396b50750fd430a5934488" ON "snapshot" ("datastore_id")
        `);
        await queryRunner.query(`
            ALTER TABLE "archive"
            ADD CONSTRAINT "FK_c4e88c904cf036e5ed64169de57" FOREIGN KEY ("datastore_id") REFERENCES "datastore"("id") ON DELETE CASCADE ON UPDATE CASCADE
        `);
        await queryRunner.query(`
            ALTER TABLE "snapshot"
            ADD CONSTRAINT "FK_ea42396b50750fd430a59344885" FOREIGN KEY ("datastore_id") REFERENCES "datastore"("id") ON DELETE CASCADE ON UPDATE CASCADE
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "snapshot" DROP CONSTRAINT "FK_ea42396b50750fd430a59344885"
        `);
        await queryRunner.query(`
            ALTER TABLE "archive" DROP CONSTRAINT "FK_c4e88c904cf036e5ed64169de57"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_ea42396b50750fd430a5934488"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_c4e88c904cf036e5ed64169de5"
        `);
        await queryRunner.query(`
            ALTER TABLE "snapshot" DROP COLUMN "datastore_id"
        `);
        await queryRunner.query(`
            ALTER TABLE "archive" DROP COLUMN "datastore_id"
        `);
    }

}
