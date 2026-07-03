import { Global, Module } from "@nestjs/common";
import { EventStreamService } from "./event-stream.service";
import { QueueService } from "./queue.service";
import { TokenCipherService } from "./token-cipher.service";

@Global()
@Module({
  providers: [QueueService, TokenCipherService, EventStreamService],
  exports: [QueueService, TokenCipherService, EventStreamService],
})
export class CommonModule {}
