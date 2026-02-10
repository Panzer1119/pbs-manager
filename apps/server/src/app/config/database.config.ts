import { ConfigService, registerAs } from "@nestjs/config";
import { TypeOrmModuleOptions } from "@nestjs/typeorm";
import { entities, migrations } from "@pbs-manager/database-schema";
import { SnakeNamingStrategy } from "typeorm-naming-strategies";
import { IsFQDN, IsInt, IsNotEmpty, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";

export class DatabaseVariables {
    public static readonly ENV_KEYS: (keyof DatabaseVariables)[] = [
        "DATABASE_HOST",
        "DATABASE_PORT",
        "DATABASE_NAME",
        "DATABASE_USERNAME",
        "DATABASE_PASSWORD",
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
}

export interface DatabaseConfig {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
}

export default registerAs(
    "database",
    (): DatabaseConfig => ({
        host: process.env.DATABASE_HOST ?? "localhost",
        port: process.env.DATABASE_PORT ? parseInt(process.env.DATABASE_PORT) : 5432,
        database: process.env.DATABASE_NAME ?? "pbs_manager",
        username: process.env.DATABASE_USERNAME ?? "pbs_manager",
        password: process.env.DATABASE_PASSWORD,
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
        logger: "advanced-console",
        // logging: "all",
        // logging: true,
        logging: ["error", "warn"],
    };
}
