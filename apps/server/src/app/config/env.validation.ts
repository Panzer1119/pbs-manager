import { IsEnum, IsFQDN, IsInt, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { DatabaseVariables } from "./database.config";
import { QueueVariables } from "./queue.config";
import { transformAndValidateConfigWithKeys } from "../validation-utils";

export enum Environment {
    Development = "development",
    Production = "production",
    Test = "test",
    Provision = "provision",
}

export class EnvironmentVariables {
    public static readonly ENV_KEYS: (keyof EnvironmentVariables)[] = ["NODE_ENV", "HOST", "PORT"];

    @IsEnum(Environment)
    NODE_ENV: Environment = Environment.Development;

    @IsFQDN({ require_tld: false, allow_numeric_tld: true })
    HOST: string = "localhost";

    @Type(() => Number)
    @IsInt()
    @Min(1024)
    @Max(49151)
    PORT: number = 3333;
}

export function validate(plainConfig: Record<string, unknown>): Record<string, unknown> {
    return Object.assign(
        plainConfig,
        transformAndValidateConfigWithKeys(EnvironmentVariables, plainConfig, EnvironmentVariables.ENV_KEYS),
        transformAndValidateConfigWithKeys(DatabaseVariables, plainConfig, DatabaseVariables.ENV_KEYS),
        transformAndValidateConfigWithKeys(QueueVariables, plainConfig, QueueVariables.ENV_KEYS)
    );
}
