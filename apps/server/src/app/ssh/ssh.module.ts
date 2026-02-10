import { Module } from "@nestjs/common";
import { SSHService } from "./ssh.service";
import { SSHProcessor } from "./ssh.processor";

@Module({
    providers: [SSHService, SSHProcessor],
    exports: [SSHService],
})
export class SSHModule {}
