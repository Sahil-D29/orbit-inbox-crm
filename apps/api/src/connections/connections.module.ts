import { Module } from "@nestjs/common";
import { ConnectionsController } from "./connections.controller";
import { ConnectionsService } from "./connections.service";
import { OAuthStateService } from "./oauth-state.service";

@Module({
  controllers: [ConnectionsController],
  providers: [ConnectionsService, OAuthStateService],
})
export class ConnectionsModule {}
