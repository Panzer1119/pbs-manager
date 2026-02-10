import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { SSHProcessor } from "./ssh.processor";
import { Queue } from "bullmq";

@Injectable()
export class SSHService implements OnModuleInit {
    private readonly logger: Logger = new Logger(SSHService.name);

    constructor(
        @InjectQueue(SSHProcessor.QUEUE_NAME)
        private readonly sshQueue: Queue
    ) {}

    async onModuleInit(): Promise<void> {
        await this.drainQueue();
    }

    async drainQueue(): Promise<void> {
        try {
            await this.sshQueue.drain(true);
            this.logger.verbose(`Drained ${JSON.stringify(SSHProcessor.QUEUE_NAME)} queue`);
        } catch (error) {
            this.logger.error(`Failed to drain ${JSON.stringify(SSHProcessor.QUEUE_NAME)} queue: ${error}`);
        }
    }
}
