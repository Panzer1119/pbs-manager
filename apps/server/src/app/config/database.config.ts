import { ConfigService, registerAs } from "@nestjs/config";
import { TypeOrmModuleOptions } from "@nestjs/typeorm";
import { entities, migrations } from "@pbs-manager/database-schema";
import { SnakeNamingStrategy } from "typeorm-naming-strategies";
import { IsFQDN, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";

export class DatabaseVariables {
    public static readonly ENV_KEYS: (keyof DatabaseVariables)[] = [
        "DATABASE_HOST",
        "DATABASE_PORT",
        "DATABASE_NAME",
        "DATABASE_USERNAME",
        "DATABASE_PASSWORD",
        "DATABASE_REDIS_HOST",
        "DATABASE_REDIS_PORT",
        "DATABASE_REDIS_USERNAME",
        "DATABASE_REDIS_PASSWORD",
        "DATABASE_REDIS_DB",
    ];

    @IsFQDN({ require_tld: false, allow_numeric_tld: true })
    DATABASE_HOST: string = "localhost";

    @Type(() => Number)
    @IsInt()
    @Min(1024)
    @Max(49151)
    DATABASE_PORT: number = 5432;

    @IsString()
    @IsNotEmpty()
    DATABASE_NAME: string = "pbs_manager";

    @IsString()
    @IsNotEmpty()
    DATABASE_USERNAME: string = "pbs_manager";

    @IsString()
    DATABASE_PASSWORD: string;

    @IsOptional()
    @IsFQDN({ require_tld: false, allow_numeric_tld: true })
    DATABASE_REDIS_HOST: string | undefined;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1024)
    @Max(49151)
    DATABASE_REDIS_PORT: number | undefined;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    DATABASE_REDIS_USERNAME: string | undefined;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    DATABASE_REDIS_PASSWORD: string | undefined;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    @Max(15)
    DATABASE_REDIS_DB: number | undefined;
}

export interface DatabaseConfig {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    redis: {
        host?: string;
        port?: number;
        username?: string;
        password?: string;
        db?: number;
    };
}

export default registerAs(
    "database",
    (): DatabaseConfig => ({
        host: process.env.DATABASE_HOST ?? "localhost",
        port: process.env.DATABASE_PORT ? parseInt(process.env.DATABASE_PORT) : 5432,
        database: process.env.DATABASE_NAME ?? "pbs_manager",
        username: process.env.DATABASE_USERNAME ?? "pbs_manager",
        password: process.env.DATABASE_PASSWORD,
        redis: {
            host: process.env.DATABASE_REDIS_HOST,
            port: process.env.DATABASE_REDIS_PORT ? parseInt(process.env.DATABASE_REDIS_PORT) : 6379,
            username: process.env.DATABASE_REDIS_USERNAME,
            password: process.env.DATABASE_REDIS_PASSWORD,
            db: process.env.DATABASE_REDIS_DB ? parseInt(process.env.DATABASE_REDIS_DB) : undefined,
        },
    })
);

export async function createTypeORMConfig(config: ConfigService): Promise<TypeOrmModuleOptions> {
    const databaseConfig: DatabaseConfig = config.get<DatabaseConfig>("database");
    return {
        type: "postgres",
        entities: Object.values(entities),
        migrations: Object.values(migrations),
        migrationsRun: true,
        synchronize: false,
        host: databaseConfig.host,
        port: databaseConfig.port,
        database: databaseConfig.database,
        username: databaseConfig.username,
        password: databaseConfig.password,
        namingStrategy: new SnakeNamingStrategy(),
        cache:
            databaseConfig.redis?.host == null
                ? false
                : {
                      type: "ioredis",
                      options: {
                          host: databaseConfig.redis.host,
                          port: databaseConfig.redis.port,
                          username: databaseConfig.redis.username,
                          password: databaseConfig.redis.password,
                          db: databaseConfig.redis.db,
                      },
                      ignoreErrors: true,
                      // alwaysEnabled: true,
                      // duration: 10000, // 10 seconds
                  },
        logger: "advanced-console",
        // logging: "all",
        // logging: true,
        logging: ["error", "warn"],
    };
}
