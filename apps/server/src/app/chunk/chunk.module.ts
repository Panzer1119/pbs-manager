import { Module } from "@nestjs/common";
import { ChunkService } from "./chunk.service";
import { ChunkController } from "./chunk.controller";

@Module({
    providers: [ChunkService],
    controllers: [ChunkController],
})
export class ChunkModule {}
