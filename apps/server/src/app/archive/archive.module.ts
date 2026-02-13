import { Module } from "@nestjs/common";
import { ArchiveService } from "./archive.service";
import { ArchiveController } from "./archive.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { FileArchive, ImageArchive } from "@pbs-manager/database-schema";
import { DatastoreModule } from "../datastore/datastore.module";

@Module({
    imports: [TypeOrmModule.forFeature([FileArchive, ImageArchive]), DatastoreModule],
    providers: [ArchiveService],
    controllers: [ArchiveController],
    exports: [ArchiveService],
})
export class ArchiveModule {}
