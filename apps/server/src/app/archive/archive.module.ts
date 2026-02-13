import { Module } from "@nestjs/common";
import { ArchiveService } from "./archive.service";

@Module({
    providers: [ArchiveService],
})
export class ArchiveModule {}
