import { Module } from "@nestjs/common";
import { SSHService } from "./ssh.service";

@Module({
    providers: [SSHService],
})
export class SSHModule {}
