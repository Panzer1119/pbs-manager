import { ConfigService, registerAs } from "@nestjs/config";
import { IsFQDN, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { BullRootModuleOptions } from "@nestjs/bullmq";
import * as Redis from "ioredis";
import * as Bull from "bullmq";

export class QueueVariables {
    public static readonly ENV_KEYS: (keyof QueueVariables)[] = [
        "QUEUE_REDIS_HOST",
        "QUEUE_REDIS_PORT",
        "QUEUE_REDIS_USERNAME",
        "QUEUE_REDIS_PASSWORD",
        "QUEUE_REDIS_DB",
        "QUEUE_PREFIX",
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

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(15)
    QUEUE_REDIS_DB: number | undefined;

    @IsOptional()
    @IsString()
    QUEUE_PREFIX: string | undefined;
}

export interface QueueConfig {
    host: string;
    port: number;
    username?: string;
    password?: string;
    database?: number;
    prefix?: string;
}

export default registerAs("queue", () => ({
    host: process.env.QUEUE_REDIS_HOST ?? "localhost",
    port: process.env.QUEUE_REDIS_PORT ?? 6379,
    username: process.env.QUEUE_REDIS_USERNAME,
    password: process.env.QUEUE_REDIS_PASSWORD,
    database: process.env.QUEUE_REDIS_DB,
    prefix: process.env.QUEUE_PREFIX,
}));

export async function createBullConfig(config: ConfigService): Promise<BullRootModuleOptions> {
    const queueConfig: QueueConfig = config.get<QueueConfig>("queue");
    const redisOptions: Redis.RedisOptions = {
        host: queueConfig.host,
        port: queueConfig.port,
        username: queueConfig.username,
        password: queueConfig.password,
        db: queueConfig.database,
    };
    return <Bull.QueueOptions>{
        connection: redisOptions,
        prefix: queueConfig.prefix,
    };
}
