import { Module } from "@nestjs/common";
import { ChunkService } from "./chunk.service";

@Module({
    providers: [ChunkService],
})
export class ChunkModule {}
