import { Module } from "@nestjs/common";
import { DatastoreService } from "./datastore.service";
import { DatastoreController } from "./datastore.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Datastore } from "@pbs-manager/database-schema";

@Module({
    imports: [TypeOrmModule.forFeature([Datastore])],
    providers: [DatastoreService],
    controllers: [DatastoreController],
    exports: [DatastoreService],
})
export class DatastoreModule {}
