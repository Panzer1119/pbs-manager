import { ConfigService, registerAs } from "@nestjs/config";
import { IsFQDN, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { BullRootModuleOptions } from "@nestjs/bullmq";
import * as Redis from "ioredis";
import * as Bull from "bullmq";
import { BullBoardModuleOptions } from "@bull-board/nestjs/src/bull-board.types";
import { ExpressAdapter } from "@bull-board/express";
import basicAuth from "express-basic-auth";
import { RequestHandler } from "express";

export class QueueVariables {
    public static readonly ENV_KEYS: (keyof QueueVariables)[] = [
        "QUEUE_REDIS_HOST",
        "QUEUE_REDIS_PORT",
        "QUEUE_REDIS_USERNAME",
        "QUEUE_REDIS_PASSWORD",
        "QUEUE_REDIS_DB",
        "QUEUE_PREFIX",
        "QUEUE_DASHBOARD_ROUTE",
        "QUEUE_DASHBOARD_BASE_PATH",
        "QUEUE_DASHBOARD_USERNAME",
        "QUEUE_DASHBOARD_PASSWORD",
    ];

    @IsFQDN({ require_tld: false, allow_numeric_tld: true })
    QUEUE_REDIS_HOST: string = "localhost";

    @Type(() => Number)
    @IsInt()
    @Min(1024)
    @Max(49151)
    QUEUE_REDIS_PORT: number = 6379;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    QUEUE_REDIS_USERNAME: string | undefined;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    QUEUE_REDIS_PASSWORD: string | undefined;

    @Type(() => Number)
    @IsInt()
    @Min(0)
    @Max(15)
    QUEUE_REDIS_DB: number = 0;

    @IsOptional()
    @IsString()
    QUEUE_PREFIX: string | undefined;

    @IsString()
    QUEUE_DASHBOARD_ROUTE: string = "/queues";

    @IsOptional()
    @IsString()
    QUEUE_DASHBOARD_BASE_PATH: string | undefined;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    QUEUE_DASHBOARD_USERNAME: string | undefined;

    @IsOptional()
    @IsString()
    QUEUE_DASHBOARD_PASSWORD: string | undefined;
}

export interface QueueConfig {
    host: string;
    port: number;
    database: number;
    username?: string;
    password?: string;
    prefix?: string;
    dashboard: {
        route: string;
        basePath?: string;
        username?: string;
        password?: string;
    };
}

export default registerAs(
    "queue",
    (): QueueConfig => ({
        host: process.env.QUEUE_REDIS_HOST ?? "localhost",
        port: process.env.QUEUE_REDIS_PORT ? parseInt(process.env.QUEUE_REDIS_PORT) : 6379,
        database: process.env.QUEUE_REDIS_DB ? parseInt(process.env.QUEUE_REDIS_DB) : 0,
        username: process.env.QUEUE_REDIS_USERNAME,
        password: process.env.QUEUE_REDIS_PASSWORD,
        prefix: process.env.QUEUE_PREFIX,
        dashboard: {
            route: process.env.QUEUE_DASHBOARD_ROUTE ?? "/queues",
            basePath: process.env.QUEUE_DASHBOARD_BASE_PATH,
            username: process.env.QUEUE_DASHBOARD_USERNAME,
            password: process.env.QUEUE_DASHBOARD_PASSWORD ?? "",
        },
    })
);

export async function createBullConfig(config: ConfigService): Promise<BullRootModuleOptions> {
    const queueConfig: QueueConfig = config.get<QueueConfig>("queue");
    const redisOptions: Redis.RedisOptions = {
        host: queueConfig.host,
        port: queueConfig.port,
        db: queueConfig.database,
        username: queueConfig.username,
        password: queueConfig.password,
    };
    return <Bull.QueueOptions>{
        connection: redisOptions,
        prefix: queueConfig.prefix,
    };
}

export async function createBullBoardConfig(config: ConfigService): Promise<BullBoardModuleOptions> {
    const queueConfig: QueueConfig = config.get<QueueConfig>("queue");
    const middleware: RequestHandler | undefined =
        queueConfig.dashboard?.username != null
            ? basicAuth({
                  challenge: true,
                  users: { [queueConfig.dashboard.username]: queueConfig.dashboard.password },
              })
            : undefined;
    return <BullBoardModuleOptions>{
        route: queueConfig.dashboard?.route || "/queues",
        adapter: ExpressAdapter,
        boardOptions: {
            uiConfig: {
                dateFormats: {
                    short: "hh:mm:ss",
                    common: "yyyy-MM-dd HH:mm:ss",
                    full: "yyyy-MM-dd HH:mm:ss",
                },
            },
            uiBasePath: queueConfig.dashboard?.basePath,
        },
        middleware,
    };
}
