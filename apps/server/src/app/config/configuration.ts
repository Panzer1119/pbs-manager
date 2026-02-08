export interface GlobalConfiguration {
    host: string;
    port: number;
    globalPrefix: string;
    appName: string;
    dbEncryptionKey?: string;
    timezone?: string;
    displayTimezone?: string;
}

export default (): GlobalConfiguration => ({
    host: process.env.HOST || "localhost",
    port: parseInt(process.env.PORT, 10) || 3000,
    globalPrefix: process.env.GLOBAL_PREFIX || "/api",
    appName: process.env.APP_NAME || "PBS Manager",
    dbEncryptionKey: process.env.DB_ENCRYPTION_KEY,
    timezone: process.env.TZ || "UTC",
    displayTimezone: process.env.DISPLAY_TZ || "UTC",
});
