import { Module } from "@nestjs/common";
import { DatastoreService } from "./datastore.service";

@Module({
    providers: [DatastoreService],
})
export class DatastoreModule {}
