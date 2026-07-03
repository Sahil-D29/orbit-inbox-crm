import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { AuthModule } from "./auth/auth.module";
import { TenantGuard } from "./auth/tenant.guard";
import { CommonModule } from "./common/common.module";
import { ConnectionsModule } from "./connections/connections.module";
import { ContactsModule } from "./contacts/contacts.module";
import { HealthController } from "./health.controller";
import { InboxModule } from "./inbox/inbox.module";
import { ModerationModule } from "./moderation/moderation.module";
import { ManagementModule } from "./management/management.module";
import { ProvidersModule } from "./providers/providers.module";
import { WebhooksModule } from "./webhooks/webhooks.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ["../../.env", ".env"] }),
    CommonModule,
    AuthModule,
    ProvidersModule,
    ConnectionsModule,
    InboxModule,
    ContactsModule,
    ModerationModule,
    ManagementModule,
    WebhooksModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: TenantGuard }],
})
export class AppModule {}
