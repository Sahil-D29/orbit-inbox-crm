import { Body, Controller, Get, Headers, Param, Patch, Post, Query, Sse } from "@nestjs/common";
import type { InboxQuery, TenantContext } from "@crm/contracts";
import { CurrentTenant } from "../auth/tenant-context.decorator";
import { EventStreamService } from "../common/event-stream.service";
import { InboxService } from "./inbox.service";

@Controller()
export class InboxController {
  constructor(
    private readonly inbox: InboxService,
    private readonly events: EventStreamService,
  ) {}

  @Get("inbox")
  list(@CurrentTenant() context: TenantContext, @Query() query: InboxQuery) {
    return this.inbox.list(context, query);
  }

  @Get("conversations/:id")
  detail(@CurrentTenant() context: TenantContext, @Param("id") id: string) {
    return this.inbox.detail(context, id);
  }

  @Patch("conversations/:id")
  update(
    @CurrentTenant() context: TenantContext,
    @Param("id") id: string,
    @Body() body: { status?: "OPEN" | "PENDING" | "CLOSED"; assigneeId?: string | null; unread?: boolean },
  ) {
    return this.inbox.update(context, id, body);
  }

  @Post("conversations/:id/labels/:labelId")
  addLabel(
    @CurrentTenant() context: TenantContext,
    @Param("id") id: string,
    @Param("labelId") labelId: string,
  ) {
    return this.inbox.addLabel(context, id, labelId);
  }

  @Post("conversations/:id/reply")
  reply(
    @CurrentTenant() context: TenantContext,
    @Param("id") id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body()
    body: {
      text: string;
      template?: { name: string; language: string; components?: Record<string, unknown>[] };
    },
  ) {
    return this.inbox.reply(context, id, body, idempotencyKey);
  }

  @Post("conversations/bulk")
  bulk(
    @CurrentTenant() context: TenantContext,
    @Body()
    body: {
      ids: string[];
      status?: "OPEN" | "PENDING" | "CLOSED";
      assigneeId?: string | null;
      labelId?: string;
    },
  ) {
    return this.inbox.bulk(context, body);
  }

  @Get("labels")
  labels(@CurrentTenant() context: TenantContext) {
    return this.inbox.labels(context);
  }

  @Get("saved-views")
  savedViews(@CurrentTenant() context: TenantContext) {
    return this.inbox.savedViews(context);
  }

  @Post("saved-views")
  saveView(
    @CurrentTenant() context: TenantContext,
    @Body() body: { name: string; query: Record<string, unknown> },
  ) {
    return this.inbox.saveView(context, body);
  }

  @Sse("events")
  stream(@CurrentTenant() context: TenantContext) {
    return this.events.forTenant(context.tenantId);
  }
}
