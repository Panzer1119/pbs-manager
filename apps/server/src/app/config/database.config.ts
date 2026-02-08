import { registerAs } from "@nestjs/config";
import { TypeOrmModuleOptions } from "@nestjs/typeorm";
import { entities, migrations } from "@pbs-manager/database-schema";
import { SnakeNamingStrategy } from "typeorm-naming-strategies";

export default registerAs(
    "database",
    (): TypeOrmModuleOptions => ({
        type: "postgres",
        entities: Object.values(entities),
        migrations: Object.values(migrations),
        migrationsRun: true,
        synchronize: false,
        host: process.env.DATABASE_HOST || "localhost",
        port: parseInt(process.env.DATABASE_PORT, 10) || 5432,
        database: process.env.DATABASE_NAME || "pbs_manager",
        username: process.env.DATABASE_USERNAME || "pbs_manager",
        password: process.env.DATABASE_PASSWORD || "pbs_manager",
        namingStrategy: new SnakeNamingStrategy(),
        logger: "advanced-console",
        // logging: "all",
        // logging: true,
        logging: ["error", "warn"],
    })
);
