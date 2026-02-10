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
import bullConfig, { createBullConfig } from "./config/queue.config";
import { BullBoardModule } from "@bull-board/nestjs";
import { ExpressAdapter } from "@bull-board/express";
import { SSHModule } from "./ssh/ssh.module";

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            cache: true,
            load: [configuration, databaseConfig],
            validate,
        }),
        ScheduleModule.forRoot(),
        EventEmitterModule.forRoot({ wildcard: true }),
        BullModule.forRootAsync({
            imports: [ConfigModule.forFeature(bullConfig)],
            useFactory: createBullConfig,
            inject: [ConfigService],
        }),
        BullBoardModule.forRoot({
            route: "/queues", //TODO Make this configurable?
            adapter: ExpressAdapter,
        }),
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule.forFeature(databaseConfig)],
            useFactory: createTypeORMConfig,
            inject: [ConfigService],
        }),
        SSHModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}
