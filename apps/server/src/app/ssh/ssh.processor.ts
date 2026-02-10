import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger, OnModuleInit } from "@nestjs/common";
import { Job } from "bullmq";

@Processor(SSHProcessor.QUEUE_NAME)
export class SSHProcessor extends WorkerHost implements OnModuleInit {
    public static readonly QUEUE_NAME: string = "ssh";

    private readonly logger: Logger = new Logger(SSHProcessor.name);

    onModuleInit(): void {
        this.logger.verbose(`Initialized ${JSON.stringify(SSHProcessor.QUEUE_NAME)} queue processor`);
    }

    process(job: Job, token?: string): Promise<unknown> {
        this.logger.verbose(
            `Processing job ${JSON.stringify(job.name)} with id ${JSON.stringify(job.id)} and token ${JSON.stringify(token)}`
        );
        throw new Error("Method not implemented.");
    }
}
