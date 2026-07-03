import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Queue } from "bullmq";

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };
  readonly inbound = new Queue("inbound-events", { connection: this.connection });
  readonly outbound = new Queue("outbound-messages", { connection: this.connection });
  readonly imports = new Queue("history-imports", { connection: this.connection });
  readonly reconciliation = new Queue("reconciliation", { connection: this.connection });

  async onModuleDestroy() {
    await Promise.all([
      this.inbound.close(),
      this.outbound.close(),
      this.imports.close(),
      this.reconciliation.close(),
    ]);
  }
}
