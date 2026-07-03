import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { InboxQuery, TenantContext } from "@crm/contracts";
import { db, Prisma } from "@crm/database";
import { randomUUID } from "node:crypto";
import { EventStreamService } from "../common/event-stream.service";
import { QueueService } from "../common/queue.service";

@Injectable()
export class InboxService {
  constructor(
    private readonly queues: QueueService,
    private readonly events: EventStreamService,
  ) {}

  async list(context: TenantContext, query: InboxQuery) {
    const limit = Math.min(Math.max(Number(query.limit) || 30, 1), 100);
    const where: Prisma.ConversationWhereInput = {
      tenantId: context.tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...(String(query.unread) === "true" ? { unreadCount: { gt: 0 } } : {}),
      ...(query.labelId ? { labels: { some: { labelId: query.labelId } } } : {}),
      ...(query.q
        ? {
            OR: [
              { subject: { contains: query.q, mode: "insensitive" } },
              { contact: { displayName: { contains: query.q, mode: "insensitive" } } },
              { messages: { some: { text: { contains: query.q, mode: "insensitive" } } } },
            ],
          }
        : {}),
    };
    const conversations = await db.conversation.findMany({
      where,
      include: {
        contact: true,
        assignee: { select: { id: true, name: true } },
        labels: { include: { label: true } },
        messages: { orderBy: { sentAt: "desc" }, take: 1 },
      },
      orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = conversations.length > limit;
    const page = hasMore ? conversations.slice(0, limit) : conversations;
    return {
      items: page.map((conversation) => ({
        id: conversation.id,
        channel: conversation.channel,
        status: conversation.status,
        subject: conversation.subject ?? conversation.contact?.displayName ?? "Conversation",
        preview: conversation.messages[0]?.text ?? "",
        contact: {
          id: conversation.contact?.id ?? "",
          name: conversation.contact?.displayName ?? "Unknown contact",
          avatarUrl: conversation.contact?.avatarUrl ?? undefined,
        },
        unreadCount: conversation.unreadCount,
        lastMessageAt: conversation.lastMessageAt.toISOString(),
        assignee: conversation.assignee ?? undefined,
        labels: conversation.labels.map(({ label }) => label),
        serviceWindowExpiresAt: conversation.serviceWindowExpiresAt?.toISOString(),
      })),
      nextCursor: hasMore ? page.at(-1)?.id : null,
    };
  }

  async detail(context: TenantContext, id: string) {
    const conversation = await db.conversation.findFirst({
      where: { id, tenantId: context.tenantId },
      include: {
        connection: { select: { id: true, provider: true, displayName: true } },
        assignee: { select: { id: true, name: true } },
        labels: { include: { label: true } },
        messages: { include: { attachments: true }, orderBy: { sentAt: "asc" } },
        contact: {
          include: {
            identities: true,
            labels: { include: { label: true } },
            notes: { include: { author: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } },
            comments: { include: { post: true }, orderBy: { commentedAt: "desc" }, take: 10 },
          },
        },
      },
    });
    if (!conversation) throw new NotFoundException("Conversation not found");
    if (conversation.unreadCount > 0) {
      await db.conversation.update({ where: { id }, data: { unreadCount: 0 } });
    }
    return conversation;
  }

  async update(
    context: TenantContext,
    id: string,
    body: { status?: "OPEN" | "PENDING" | "CLOSED"; assigneeId?: string | null; unread?: boolean },
  ) {
    const current = await this.requireConversation(context.tenantId, id);
    if (body.assigneeId) {
      const membership = await db.membership.findUnique({
        where: { tenantId_userId: { tenantId: context.tenantId, userId: body.assigneeId } },
      });
      if (!membership) throw new BadRequestException("Assignee does not belong to this tenant");
    }
    const updated = await db.conversation.update({
      where: { id },
      data: {
        status: body.status,
        assigneeId: body.assigneeId,
        unreadCount: body.unread === true ? Math.max(current.unreadCount, 1) : body.unread === false ? 0 : undefined,
      },
    });
    await this.audit(context, "conversation.updated", "Conversation", id, current, updated);
    this.events.publish(context.tenantId, "conversation.updated", { id });
    return updated;
  }

  async addLabel(context: TenantContext, id: string, labelId: string) {
    await this.requireConversation(context.tenantId, id);
    const label = await db.label.findFirst({ where: { id: labelId, tenantId: context.tenantId } });
    if (!label) throw new NotFoundException("Label not found");
    await db.conversationLabel.upsert({
      where: { conversationId_labelId: { conversationId: id, labelId } },
      update: {},
      create: { tenantId: context.tenantId, conversationId: id, labelId },
    });
    return { attached: true };
  }

  async reply(
    context: TenantContext,
    id: string,
    body: {
      text: string;
      template?: { name: string; language: string; components?: Record<string, unknown>[] };
    },
    suppliedKey?: string,
  ) {
    if (!body.text?.trim() && !body.template) throw new BadRequestException("Reply text or template is required");
    const conversation = await db.conversation.findFirst({
      where: { id, tenantId: context.tenantId },
      include: {
        contact: { include: { identities: true } },
        messages: { orderBy: { sentAt: "desc" }, take: 1 },
      },
    });
    if (!conversation) throw new NotFoundException("Conversation not found");
    if (
      conversation.channel === "WHATSAPP" &&
      (!conversation.serviceWindowExpiresAt || conversation.serviceWindowExpiresAt < new Date()) &&
      !body.template
    ) {
      throw new BadRequestException("Select an approved template because the WhatsApp service window is closed");
    }
    const identity = conversation.contact?.identities.find(
      (item) => item.provider === conversation.channel,
    );
    if (!identity) throw new BadRequestException("The contact has no recipient identity for this channel");
    const idempotencyKey = suppliedKey ?? randomUUID();
    const localMessageId = `local-${idempotencyKey}`;
    const result = await db.$transaction(async (tx) => {
      const existing = await tx.outboundJob.findUnique({
        where: { tenantId_idempotencyKey: { tenantId: context.tenantId, idempotencyKey } },
      });
      if (existing) return existing;
      await tx.message.create({
        data: {
          tenantId: context.tenantId,
          conversationId: conversation.id,
          externalId: localMessageId,
          direction: "OUTBOUND",
          deliveryStatus: "QUEUED",
          senderExternalId: context.userId,
          text: body.text,
          replyToExternalId: conversation.messages[0]?.externalId,
          sentAt: new Date(),
        },
      });
      await tx.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date(), status: "OPEN" },
      });
      return tx.outboundJob.create({
        data: {
          tenantId: context.tenantId,
          connectionId: conversation.connectionId,
          conversationId: conversation.id,
          idempotencyKey,
          payload: {
            recipientExternalId: identity.externalId,
            text: body.text,
            template: body.template,
            replyToExternalId: conversation.messages[0]?.externalId,
            localMessageId,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    });
    await this.queues.outbound.add(
      "send",
      { outboundJobId: result.id },
      { jobId: result.id, attempts: 6, backoff: { type: "exponential", delay: 2_000 } },
    );
    this.events.publish(context.tenantId, "message.queued", { conversationId: id });
    return { accepted: true, outboundJobId: result.id, idempotencyKey };
  }

  async bulk(
    context: TenantContext,
    body: {
      ids: string[];
      status?: "OPEN" | "PENDING" | "CLOSED";
      assigneeId?: string | null;
      labelId?: string;
    },
  ) {
    if (!body.ids?.length || body.ids.length > 100) throw new BadRequestException("Select 1 to 100 conversations");
    const count = await db.conversation.count({
      where: { tenantId: context.tenantId, id: { in: body.ids } },
    });
    if (count !== body.ids.length) throw new NotFoundException("One or more conversations were not found");
    await db.$transaction(async (tx) => {
      if (body.status !== undefined || body.assigneeId !== undefined) {
        await tx.conversation.updateMany({
          where: { tenantId: context.tenantId, id: { in: body.ids } },
          data: { status: body.status, assigneeId: body.assigneeId },
        });
      }
      if (body.labelId) {
        const label = await tx.label.findFirst({ where: { id: body.labelId, tenantId: context.tenantId } });
        if (!label) throw new NotFoundException("Label not found");
        await tx.conversationLabel.createMany({
          data: body.ids.map((conversationId) => ({
            tenantId: context.tenantId,
            conversationId,
            labelId: body.labelId!,
          })),
          skipDuplicates: true,
        });
      }
    });
    this.events.publish(context.tenantId, "conversations.bulk-updated", { ids: body.ids });
    return { updated: body.ids.length };
  }

  labels(context: TenantContext) {
    return db.label.findMany({ where: { tenantId: context.tenantId }, orderBy: { name: "asc" } });
  }

  savedViews(context: TenantContext) {
    return db.savedView.findMany({ where: { tenantId: context.tenantId }, orderBy: { name: "asc" } });
  }

  saveView(context: TenantContext, body: { name: string; query: Record<string, unknown> }) {
    return db.savedView.create({
      data: { tenantId: context.tenantId, name: body.name.trim(), query: body.query as Prisma.InputJsonValue },
    });
  }

  private async requireConversation(tenantId: string, id: string) {
    const conversation = await db.conversation.findFirst({ where: { id, tenantId } });
    if (!conversation) throw new NotFoundException("Conversation not found");
    return conversation;
  }

  private async audit(
    context: TenantContext,
    action: string,
    entityType: string,
    entityId: string,
    before?: unknown,
    after?: unknown,
  ) {
    await db.auditLog.create({
      data: {
        tenantId: context.tenantId,
        actorId: context.userId,
        action,
        entityType,
        entityId,
        before: before as Prisma.InputJsonValue,
        after: after as Prisma.InputJsonValue,
      },
    });
  }
}
