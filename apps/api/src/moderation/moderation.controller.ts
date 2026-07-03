import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { TenantContext } from "@crm/contracts";
import { CurrentTenant } from "../auth/tenant-context.decorator";
import { ModerationService } from "./moderation.service";

@Controller("comments")
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Get()
  list(
    @CurrentTenant() context: TenantContext,
    @Query("status") status?: "OPEN" | "HIDDEN" | "RESOLVED",
    @Query("q") q?: string,
  ) {
    return this.moderation.list(context, { status, q });
  }

  @Post(":id/reply")
  reply(
    @CurrentTenant() context: TenantContext,
    @Param("id") id: string,
    @Body() body: { text: string },
  ) {
    return this.moderation.reply(context, id, body.text);
  }

  @Patch(":id")
  update(
    @CurrentTenant() context: TenantContext,
    @Param("id") id: string,
    @Body()
    body: { status?: "OPEN" | "HIDDEN" | "RESOLVED"; hidden?: boolean; assigneeId?: string | null },
  ) {
    return this.moderation.update(context, id, body);
  }
}
