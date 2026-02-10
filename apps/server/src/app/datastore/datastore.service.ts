import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Not, Repository } from "typeorm";
import { Datastore, Host, SSHConnection } from "@pbs-manager/database-schema";

@Injectable()
export class DatastoreService {
    private readonly logger: Logger = new Logger(DatastoreService.name);

    constructor(
        @InjectRepository(Datastore)
        private readonly datastoreRepository: Repository<Datastore>
    ) {}

    async getActiveSSHConnection(datastoreId: number, preferRoot: boolean = true): Promise<SSHConnection | null> {
        const sshConnections: SSHConnection[] = await this.getActiveSSHConnections(datastoreId);
        if (sshConnections.length === 0) {
            this.logger.warn(`No active SSH connections found for datastore ID: ${datastoreId}`);
            return null;
        }
        if (preferRoot) {
            const rootConnection: SSHConnection = sshConnections.find(connection => connection.username === "root");
            if (rootConnection) {
                this.logger.verbose(`Found active root SSH connection for datastore ID: ${datastoreId}`);
                return rootConnection;
            }
        }
        this.logger.verbose(`Returning first active SSH connection for datastore ID: ${datastoreId}`);
        return sshConnections[0];
    }

    async getActiveSSHConnections(datastoreId: number): Promise<SSHConnection[]> {
        this.logger.verbose(`Fetching active SSH connections for datastore ID: ${datastoreId}`);
        const datastore: Datastore = await this.datastoreRepository.findOne({
            where: { id: datastoreId, host: { sshConnections: { active: true } } },
            relations: { host: { sshConnections: { sshKeypair: true } } },
        });
        if (!datastore) {
            if ((await this.datastoreRepository.countBy({ id: datastoreId })) === 0) {
                throw new Error(`Datastore with ID ${datastoreId} not found`);
            } else if ((await this.datastoreRepository.countBy({ id: datastoreId, host: Not(IsNull()) })) === 0) {
                throw new Error(`Datastore ID ${datastoreId} has no associated host`);
            } else {
                throw new Error(`Host for datastore ID ${datastoreId} has no associated active SSH connections`);
            }
        }
        const host: Host = datastore.host;
        if (!host) {
            throw new Error(`Host for datastore ID ${datastoreId} not found`);
        }
        const sshConnections: SSHConnection[] = host.sshConnections;
        this.logger.verbose(`Found ${sshConnections.length} active SSH connections for datastore ID: ${datastoreId}`);
        return sshConnections;
    }
}
