import { Body, Controller, Delete, Get, Param, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import type { ConnectionProvider, TenantContext } from "@crm/contracts";
import { CurrentTenant } from "../auth/tenant-context.decorator";
import { Public } from "../auth/public.decorator";
import { ConnectionsService } from "./connections.service";

@Controller("connections")
export class ConnectionsController {
  constructor(private readonly connections: ConnectionsService) {}

  @Get()
  list(@CurrentTenant() context: TenantContext) {
    return this.connections.list(context);
  }

  @Post(":provider/authorize")
  authorize(
    @CurrentTenant() context: TenantContext,
    @Param("provider") provider: ConnectionProvider,
  ) {
    return this.connections.authorize(context, provider.toUpperCase() as ConnectionProvider);
  }

  @Public()
  @Get("gmail/callback")
  async gmailCallback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Res() response: Response,
  ) {
    await this.connections.completeOAuth("GMAIL", code, state);
    return response.redirect(`${process.env.WEB_URL ?? "http://localhost:3000"}/settings/channels?connected=gmail`);
  }

  @Public()
  @Get("meta/callback")
  async metaCallback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Res() response: Response,
  ) {
    await this.connections.completeOAuth("WHATSAPP", code, state);
    return response.redirect(`${process.env.WEB_URL ?? "http://localhost:3000"}/settings/channels?connected=meta`);
  }

  @Post("meta/assets")
  registerMetaAsset(
    @CurrentTenant() context: TenantContext,
    @Body()
    body: {
      provider: Exclude<ConnectionProvider, "GMAIL">;
      externalAccountId: string;
      displayName: string;
      accessToken: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    return this.connections.registerMetaAsset(context, body);
  }

  @Post(":id/import")
  startImport(@CurrentTenant() context: TenantContext, @Param("id") id: string) {
    return this.connections.startImport(context, id);
  }

  @Delete(":id")
  disconnect(@CurrentTenant() context: TenantContext, @Param("id") id: string) {
    return this.connections.disconnect(context, id);
  }
}
