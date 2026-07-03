import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { TenantContext } from "@crm/contracts";
import { CurrentTenant } from "../auth/tenant-context.decorator";
import { ManagementService } from "./management.service";

@Controller()
export class ManagementController {
  constructor(private readonly management: ManagementService) {}

  @Get("dashboard")
  dashboard(@CurrentTenant() context: TenantContext) {
    return this.management.dashboard(context);
  }

  @Get("analytics")
  analytics(
    @CurrentTenant() context: TenantContext,
    @Query("days") days?: string,
  ) {
    return this.management.analytics(context, Number(days) || 30);
  }

  @Get("agents")
  agents(@CurrentTenant() context: TenantContext) {
    return this.management.agents(context);
  }

  @Post("agents")
  inviteAgent(
    @CurrentTenant() context: TenantContext,
    @Body() body: { email: string; name: string; role?: "ADMIN" | "AGENT"; capacity?: number },
  ) {
    return this.management.inviteAgent(context, body);
  }

  @Patch("agents/:userId")
  updateAgent(
    @CurrentTenant() context: TenantContext,
    @Param("userId") userId: string,
    @Body()
    body: {
      role?: "ADMIN" | "AGENT";
      status?: "ACTIVE" | "INVITED" | "SUSPENDED";
      availability?: "ONLINE" | "AWAY" | "OFFLINE";
      capacity?: number;
    },
  ) {
    return this.management.updateAgent(context, userId, body);
  }

  @Get("workspace-settings")
  settings(@CurrentTenant() context: TenantContext) {
    return this.management.settings(context);
  }

  @Patch("workspace-settings")
  updateSettings(
    @CurrentTenant() context: TenantContext,
    @Body()
    body: {
      name?: string;
      timezone?: string;
      retentionDays?: number;
      firstResponseSlaMinutes?: number;
      resolutionSlaMinutes?: number;
      assignmentMode?: "MANUAL" | "BALANCED" | "ROUND_ROBIN";
      businessHours?: { days: number[]; start: string; end: string };
    },
  ) {
    return this.management.updateSettings(context, body);
  }
}
