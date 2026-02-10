import { registerAs } from "@nestjs/config";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class PushoverVariables {
    public static readonly ENV_KEYS: (keyof PushoverVariables)[] = ["PUSHOVER_USER_KEY", "PUSHOVER_API_TOKEN"];

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    PUSHOVER_USER_KEY: string | undefined;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    PUSHOVER_API_TOKEN: string | undefined;
}

export interface PushoverConfig {
    userKey?: string;
    apiToken?: string;
}

export default registerAs(
    "pushover",
    (): PushoverConfig => ({
        userKey: process.env.PUSHOVER_USER_KEY,
        apiToken: process.env.PUSHOVER_API_TOKEN,
    })
);
