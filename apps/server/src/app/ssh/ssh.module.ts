import { Module } from "@nestjs/common";
import { SSHService } from "./ssh.service";
import { SSHProcessor } from "./ssh.processor";
import { BullModule } from "@nestjs/bullmq";
import { BullBoardModule } from "@bull-board/nestjs";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";

@Module({
    imports: [
        BullModule.registerQueue({ name: SSHProcessor.QUEUE_NAME }),
        BullBoardModule.forFeature({ name: SSHProcessor.QUEUE_NAME, adapter: BullMQAdapter }),
    ],
    providers: [SSHService, SSHProcessor],
    exports: [SSHService],
})
export class SSHModule {}
