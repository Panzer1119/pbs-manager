import { MigrationInterface, QueryRunner } from "typeorm";

export class ConvertSomePartialIndexesToFullIndexes1770864070055 implements MigrationInterface {
    name = 'ConvertSomePartialIndexesToFullIndexes1770864070055'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."IDX_3521fb5577ba513bc924c8d40f"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_388fac50b35877846012f647e4"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_9b63099613b6d2ce33cb7fdc01"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_17df6082537116ada02719f9e2"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_31f7f04d741d346c02cc229fd5"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_8c4833eb7679ca23f3e150dc96"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_ff75ddc41d709f2bdfad094b61"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_f22cefe8110bb95f18241eaf0b"
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_c04f48299838ccc5a9c20dda34" ON "chunk" ("datastore_id", "hash_sha256")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_26e607b1d13ab434179397eb6c" ON "datastore" ("host_id", "name")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_a11823eb853d0c3785095b6d4d" ON "snapshot" ("group_id", "time")
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_1664f12fc475f2ba20691ce2f4" ON "archive" ("snapshot_id", "type", "name")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."IDX_1664f12fc475f2ba20691ce2f4"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_a11823eb853d0c3785095b6d4d"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_26e607b1d13ab434179397eb6c"
        `);
        await queryRunner.query(`
            DROP INDEX "public"."IDX_c04f48299838ccc5a9c20dda34"
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_f22cefe8110bb95f18241eaf0b" ON "archive" ("type", "snapshot_id", "name")
            WHERE (metadata_deletion IS NULL)
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_ff75ddc41d709f2bdfad094b61" ON "archive" (
                "type",
                "snapshot_id",
                "name",
                "metadata_deletion"
            )
            WHERE (metadata_deletion IS NOT NULL)
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_8c4833eb7679ca23f3e150dc96" ON "snapshot" ("group_id", "time")
            WHERE (metadata_deletion IS NULL)
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_31f7f04d741d346c02cc229fd5" ON "snapshot" ("group_id", "time", "metadata_deletion")
            WHERE (metadata_deletion IS NOT NULL)
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_17df6082537116ada02719f9e2" ON "datastore" ("host_id", "name")
            WHERE (metadata_deletion IS NULL)
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_9b63099613b6d2ce33cb7fdc01" ON "datastore" ("host_id", "name", "metadata_deletion")
            WHERE (metadata_deletion IS NOT NULL)
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_388fac50b35877846012f647e4" ON "chunk" ("datastore_id", "hash_sha256")
            WHERE (metadata_deletion IS NULL)
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX "IDX_3521fb5577ba513bc924c8d40f" ON "chunk" (
                "datastore_id",
                "hash_sha256",
                "metadata_deletion"
            )
            WHERE (metadata_deletion IS NOT NULL)
        `);
    }

}
