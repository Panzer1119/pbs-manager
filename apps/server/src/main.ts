/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app/app.module";

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    const configService: ConfigService = app.get(ConfigService);
    const globalPrefix: string = configService.get<string>("GLOBAL_PREFIX", "/api");
    app.setGlobalPrefix(globalPrefix);
    const hostname: string = configService.get<string>("HOST", "localhost");
    const port: number = configService.get<number>("PORT", 3000);
    await app.listen(port, hostname);
    const appName: string = configService.get<string>("APP_NAME", "Application");
    Logger.log(`🚀 ${appName} is running on: http://localhost:${port}/${globalPrefix}`);
}

bootstrap();
