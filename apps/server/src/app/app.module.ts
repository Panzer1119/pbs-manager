import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import configuration from "./config/configuration";
import databaseConfig from "./config/database.config";

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            cache: true,
            load: [configuration, databaseConfig],
        }),
        TypeOrmModule.forRootAsync(databaseConfig.asProvider()),
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}
