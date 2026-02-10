import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app/app.module";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Server } from "net";
import { MyLogger } from "./app/my-logger";

const LOGGER_PREFIX: string = process.env.LOGGER_PREFIX ?? "Satisfactory Logistics Manager";
const logger: MyLogger = new MyLogger("main", { prefix: LOGGER_PREFIX, timestamp: true });

async function bootstrap(): Promise<Server> {
    logger.verbose("Creating Nest application");
    const app: NestExpressApplication = await NestFactory.create(AppModule, {
        cors: true,
        bufferLogs: true,
        logger,
    });
    const configService: ConfigService = app.get(ConfigService);

    logger.verbose("Setting up global prefix");
    const globalPrefix: string = configService.get<string>("GLOBAL_PREFIX", "/api");
    app.setGlobalPrefix(globalPrefix);

    logger.verbose("Start listening");
    const hostname: string = configService.get<string>("HOST", "localhost");
    const port: number = configService.get<number>("PORT", 3000);
    const appName: string = configService.get<string>("APP_NAME", "PBS Manager");
    return app.listen(port, hostname, async () => {
        const appUrl: string = await app.getUrl();
        logger.log(`🚀 ${appName} is running on: ${appUrl}`);
        // Optional: Uncomment the following line to enable Swagger API Documentation
        // logger.log(`Visit the Swagger API Documentation here: ${appUrl}${globalPrefix}`);
        // Optional: Uncomment the following line to enable Bull Board UI
        // logger.log(`Visit the Bull Board UI here: ${appUrl}${globalPrefix}/queues`); //TODO Make this configurable?
        // Optional: Uncomment the following line to enable Socket.IO Admin UI
        // logger.log(`Visit the Socket.IO Admin UI here: ${appUrl}/socket.io-admin-ui`); //TODO Make this configurable?
    });
}

bootstrap().catch(reason => logger.error(reason));
