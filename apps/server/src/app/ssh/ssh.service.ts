import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import {
    SSHCommandData,
    SSHCommandExecutionJob,
    SSHCommandExecutionJobOptions,
    SSHJobName,
    SSHProcessor,
} from "./ssh.processor";
import { JobsOptions, Queue } from "bullmq";
import { SSHConnectionData } from "../ssh-utils";

@Injectable()
export class SSHService implements OnModuleInit {
    private readonly logger: Logger = new Logger(SSHService.name);

    constructor(
        @InjectQueue(SSHProcessor.QUEUE_NAME)
        private readonly sshQueue: Queue<unknown, unknown, SSHJobName>
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

    async queueCommandExecution(
        connection: SSHConnectionData,
        command: SSHCommandData,
        execOptions?: SSHCommandExecutionJobOptions,
        options?: JobsOptions
    ): Promise<SSHCommandExecutionJob> {
        return (await this.sshQueue.add(
            SSHProcessor.JOB_NAME_SSH_COMMAND_EXECUTION,
            { connection, command, options: execOptions },
            options
        )) as SSHCommandExecutionJob;
    }
}
