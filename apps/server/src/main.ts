import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app/app.module";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Server } from "net";
import { MyLogger } from "./app/my-logger";
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from "@nestjs/swagger";
import { writeFileSync } from "fs";
import { join } from "path";

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

    logger.verbose("Serving static files from /assets");
    app.useStaticAssets(join(__dirname, "assets"), { prefix: "/assets/" });

    logger.verbose("Setting up global prefix");
    const globalPrefix: string = configService.get<string>("GLOBAL_PREFIX", "/api");
    app.setGlobalPrefix(globalPrefix);

    logger.verbose("Creating Swagger document builder");
    const appName: string = configService.get<string>("APP_NAME", "PBS Manager");
    const config: Omit<OpenAPIObject, "paths"> = new DocumentBuilder()
        .setTitle(`${appName}`)
        .setDescription(`The ${appName} API Description`)
        .setVersion("0.1")
        .build();

    logger.verbose("Creating Swagger document");
    const isDev: boolean = configService.get<string>("NODE_ENV", "development") === "development";
    const document: OpenAPIObject = SwaggerModule.createDocument(app, config);
    if (isDev) {
        const file = "./swagger-spec.json";
        logger.verbose(`Writing Swagger document to ${JSON.stringify(file)}`);
        writeFileSync(file, JSON.stringify(document, null, 4));
    }

    logger.verbose("Setting up SwaggerModule");
    SwaggerModule.setup(globalPrefix, app, document, {
        swaggerOptions: {
            tagsSorter: (a, b) => {
                const isADefault: boolean = a === "default";
                const isBDefault: boolean = b === "default";
                if (isADefault || isBDefault) {
                    if (isADefault && isBDefault) {
                        return 0;
                    }
                    return isADefault ? -1 : 1;
                }
                return a.localeCompare(b);
            },
            operationsSorter: (a, b) => a.get("id").localeCompare(b.get("id")),
        },
        customCssUrl: "/assets/swagger/SwaggerDark.css",
    });

    logger.verbose("Start listening");
    const hostname: string = configService.get<string>("HOST", "localhost");
    const port: number = configService.get<number>("PORT", 3000);
    const queueDashboardRoute: string = configService.get<string>("QUEUE_DASHBOARD_ROUTE", "/queues");
    return app.listen(port, hostname, async () => {
        const appUrl: string = await app.getUrl();
        logger.log(`🚀 ${appName} is running on: ${appUrl}`);
        logger.log(`Visit the Swagger API Documentation here: ${appUrl}${globalPrefix}`);
        logger.log(`Visit the Bull Board UI here: ${appUrl}${globalPrefix}${queueDashboardRoute}`);
        // Optional: Uncomment the following line to enable Socket.IO Admin UI
        // logger.log(`Visit the Socket.IO Admin UI here: ${appUrl}/socket.io-admin-ui`); //TODO Make this configurable?
    });
}

bootstrap().catch(reason => logger.error(reason));
