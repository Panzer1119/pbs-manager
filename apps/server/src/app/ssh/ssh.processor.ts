import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger, OnModuleInit } from "@nestjs/common";
import { Job } from "bullmq";
import { NodeSSH, SSHExecCommandOptions, SSHExecCommandResponse, SSHExecOptions } from "node-ssh";
import { SSHConnectionData, useSSHConnection } from "../ssh-utils";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, EntityManager } from "typeorm";

export type SSHJobName = "ssh-command-execution";

export type SSHJob<DataType, ResultType, NameType extends SSHJobName = SSHJobName> = Job<
    DataType,
    ResultType,
    NameType
>;

export type SSHCommandData =
    | string
    | string[]
    | {
          command: string;
          arguments?: string[];
      };

export interface SSHCommandExecutionJobOptions extends SSHExecCommandOptions {
    stream?: "stdout" | "stderr" | "both" | "both-stderr-to-job-log";
}

export interface SSHCommandExecutionJobData {
    connection: SSHConnectionData;
    command: SSHCommandData;
    options?: SSHCommandExecutionJobOptions;
}
export type SSHCommandExecutionJobResult = string | SSHExecCommandResponse;
export type SSHCommandExecutionJob = SSHJob<
    SSHCommandExecutionJobData,
    SSHCommandExecutionJobResult,
    "ssh-command-execution"
>;

@Processor(SSHProcessor.QUEUE_NAME, {
    removeOnComplete: { age: 60 * 60, count: 10 },
    removeOnFail: { age: 24 * 60 * 60, count: 100 },
})
export class SSHProcessor extends WorkerHost implements OnModuleInit {
    public static readonly QUEUE_NAME: string = "ssh";
    public static readonly JOB_NAME_SSH_COMMAND_EXECUTION: SSHJobName = "ssh-command-execution";

    private readonly logger: Logger = new Logger(SSHProcessor.name);

    constructor(
        @InjectDataSource()
        private readonly dataSource: DataSource
    ) {
        super();
    }

    onModuleInit(): void {
        this.logger.verbose(`Initialized ${JSON.stringify(SSHProcessor.QUEUE_NAME)} queue processor`);
    }

    async process(job: SSHJob<unknown, unknown>, token?: string): Promise<unknown> {
        this.logger.verbose(
            `Processing job ${JSON.stringify(job.name)} with id ${JSON.stringify(job.id)} and token ${JSON.stringify(token)}`
        );
        switch (job.name) {
            case SSHProcessor.JOB_NAME_SSH_COMMAND_EXECUTION:
                return this.executeSSHCommand(job as SSHCommandExecutionJob, token);
            default:
                throw new Error(`Unknown job name: ${JSON.stringify(job.name)}`);
        }
    }

    private async executeSSHCommand(
        job: SSHCommandExecutionJob,
        token?: string
    ): Promise<SSHCommandExecutionJobResult> {
        const data: SSHCommandExecutionJobData = job.data;
        const options: SSHCommandExecutionJobOptions = data.options || {};
        this.logger.verbose(
            `Executing SSH command with data: ${JSON.stringify(data)} and token: ${JSON.stringify(token)}`
        );
        return this.dataSource.transaction(
            (entityManager: EntityManager): Promise<SSHCommandExecutionJobResult> =>
                useSSHConnection(
                    entityManager,
                    data.connection,
                    async (ssh: NodeSSH): Promise<SSHCommandExecutionJobResult> => {
                        const commandData: SSHCommandData = data.command;
                        if (commandData == null) {
                            throw new Error("Command data is null or undefined");
                        }
                        let command: string;
                        let parameters: string[] = [];
                        if (typeof commandData === "string") {
                            command = commandData;
                        } else if (Array.isArray(commandData)) {
                            [command, ...parameters] = commandData;
                        } else {
                            command = commandData.command;
                            if (commandData.arguments) {
                                parameters.push(...commandData.arguments);
                            }
                        }
                        if (parameters.length === 0 && !(options && "stream" in options)) {
                            return ssh.execCommand(command, options);
                        } else {
                            if (options.stream === "both" || options.stream === "both-stderr-to-job-log") {
                                return ssh.exec(command, parameters, { ...options, stream: "both" });
                            } else {
                                return ssh.exec(
                                    command,
                                    parameters,
                                    options as SSHExecOptions & { stream?: "stdout" | "stderr" }
                                );
                            }
                        }
                    }
                ).then((result: SSHCommandExecutionJobResult): SSHCommandExecutionJobResult => {
                    if (
                        typeof result === "object" &&
                        "stderr" in result &&
                        result.stderr != null &&
                        options.stream === "both-stderr-to-job-log"
                    ) {
                        result.stderr
                            .trim()
                            .split(/\r|\n|\r\n/)
                            .map(line => line.trim())
                            .filter(line => !!line)
                            .forEach(line => job.log(line));
                        // delete result.stderr;
                        return result.stdout; //TODO Do we want to keep the return code and signal? We could also add them to the job log if we want to keep them?
                    }
                    return result;
                })
        );
    }
}
