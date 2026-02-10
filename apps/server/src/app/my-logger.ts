import { ConsoleLogger } from "@nestjs/common";
import { TZDate } from "@date-fns/tz";
import { clc, yellow } from "@nestjs/common/utils/cli-colors.util";

export class MyLogger extends ConsoleLogger {
    public enableJSON(enabled: boolean): void {
        this.options.json = enabled;
    }

    protected getTimestamp(): string {
        // return format(Date.now(), "HH:mm:ss.SSS");
        // return format(Date.now(), "yyyy-MM-dd HH:mm:ss.SSS");
        // return format(Date.now(), "yyyy-MM-ddTHH:mm:ss.SSS");
        return new TZDate().toISOString();
        // return super.getTimestamp();
    }

    protected formatTimestampDiff(timestampDiff: number): string {
        const formattedDiff = ` +${MyLogger.formatDurationMillis(timestampDiff)}`;
        if (!this.options.colors) {
            return formattedDiff;
        }
        if (timestampDiff >= 1000) {
            return clc.bold(yellow(formattedDiff));
        }
        return yellow(formattedDiff);
        // return super.formatTimestampDiff(timestampDiff);
    }

    /**
     * Format the duration in milliseconds to a human-readable format
     *
     * @param milliseconds Duration in milliseconds
     * @private
     */
    private static formatDurationMillis(milliseconds: number): string {
        // For durations less than 1 second
        if (milliseconds < 1000) {
            // Simply return the milliseconds
            return `${milliseconds}ms`;
        }
        // Calculate seconds
        const seconds: number = milliseconds / 1000;
        // For durations less than 1 minute
        if (seconds < 60) {
            // Return the seconds with 2 decimal places
            return `${seconds.toFixed(2)}s`;
        }
        // Calculate minutes
        const minutes: number = seconds / 60;
        // For durations less than 1 hour
        if (minutes < 60) {
            // Return the minutes with 2 decimal places
            return `${minutes.toFixed(2)}min`;
        }
        // Calculate hours
        const hours: number = minutes / 60;
        // For durations less than 1 day
        if (hours < 24) {
            // Return the hours with 2 decimal places
            return `${hours.toFixed(2)}h`;
        }
        // Calculate days
        const days: number = hours / 24;
        // Return the days with 2 decimal places
        return `${days.toFixed(2)}d`;
    }
}
