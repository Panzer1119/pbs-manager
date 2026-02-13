import { Module } from "@nestjs/common";
import { ArchiveService } from "./archive.service";
import { ArchiveController } from "./archive.controller";

@Module({
    providers: [ArchiveService],
    controllers: [ArchiveController],
})
export class ArchiveModule {}
