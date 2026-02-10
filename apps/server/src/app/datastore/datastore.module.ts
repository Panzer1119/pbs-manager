import { Module } from "@nestjs/common";
import { DatastoreService } from "./datastore.service";
import { DatastoreController } from "./datastore.controller";

@Module({
    providers: [DatastoreService],
    controllers: [DatastoreController],
})
export class DatastoreModule {}
