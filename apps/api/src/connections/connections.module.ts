import { Module } from "@nestjs/common";
import { ConnectionsController } from "./connections.controller";
import { ConnectionsService } from "./connections.service";
import { OAuthStateService } from "./oauth-state.service";
import { CommonModule } from "../common/common.module";
import { ProvidersModule } from "../providers/providers.module";

@Module({
  imports: [CommonModule, ProvidersModule],
  controllers: [ConnectionsController],
  providers: [ConnectionsService, OAuthStateService],
})
export class ConnectionsModule {}
