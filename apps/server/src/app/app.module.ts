import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import configuration from "./config/configuration";
import databaseConfig, { createTypeORMConfig } from "./config/database.config";
import { ScheduleModule } from "@nestjs/schedule";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { validate } from "./config/env.validation";
import { BullModule } from "@nestjs/bullmq";
import bullConfig, { createBullBoardConfig, createBullConfig } from "./config/queue.config";
import { BullBoardModule } from "@bull-board/nestjs";
import { SSHModule } from "./ssh/ssh.module";
import { SSHProcessor } from "./ssh/ssh.processor";
import { ChunkModule } from "./chunk/chunk.module";
import { DatastoreModule } from "./datastore/datastore.module";
import pushoverConfig from "./config/pushover.config";

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            cache: true,
            load: [configuration, databaseConfig, pushoverConfig],
            validate,
        }),
        ScheduleModule.forRoot(),
        EventEmitterModule.forRoot({ wildcard: true }),
        BullModule.forRootAsync({
            imports: [ConfigModule.forFeature(bullConfig)],
            useFactory: createBullConfig,
            inject: [ConfigService],
        }),
        BullBoardModule.forRootAsync({
            imports: [ConfigModule.forFeature(bullConfig)],
            useFactory: createBullBoardConfig,
            inject: [ConfigService],
        }),
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule.forFeature(databaseConfig)],
            useFactory: createTypeORMConfig,
            inject: [ConfigService],
        }),
        SSHModule,
        BullModule.registerQueue({ name: SSHProcessor.QUEUE_NAME }),
        ChunkModule,
        DatastoreModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}
