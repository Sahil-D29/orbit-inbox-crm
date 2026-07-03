import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { TenantContext } from "@crm/contracts";
import { db, Prisma } from "@crm/database";

@Injectable()
export class ManagementService {
  async dashboard(context: TenantContext) {
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: context.tenantId } });
    const since = new Date(Date.now() - 7 * 86_400_000);
    const [conversations, agents, recent] = await Promise.all([
      db.conversation.findMany({
        where: { tenantId: context.tenantId, lastMessageAt: { gte: since } },
        select: {
          id: true,
          channel: true,
          status: true,
          assigneeId: true,
          lastMessageAt: true,
          lastInboundAt: true,
          createdAt: true,
          messages: {
            select: { direction: true, sentAt: true },
            orderBy: { sentAt: "asc" },
          },
        },
      }),
      this.agents(context),
      db.conversation.findMany({
        where: { tenantId: context.tenantId },
        include: {
          contact: { select: { displayName: true } },
          assignee: { select: { name: true } },
          messages: { orderBy: { sentAt: "desc" }, take: 1, select: { text: true } },
        },
        orderBy: { lastMessageAt: "desc" },
        take: 5,
      }),
    ]);
    const open = conversations.filter((item) => item.status === "OPEN");
    const closed = conversations.filter((item) => item.status === "CLOSED");
    const firstResponseSamples = conversations.flatMap((conversation) => {
      const inbound = conversation.messages.find((message) => message.direction === "INBOUND");
      const outbound = inbound
        ? conversation.messages.find(
            (message) => message.direction === "OUTBOUND" && message.sentAt >= inbound.sentAt,
          )
        : undefined;
      return inbound && outbound
        ? [(outbound.sentAt.getTime() - inbound.sentAt.getTime()) / 60_000]
        : [];
    });
    const slaCutoff = Date.now() - tenant.firstResponseSlaMinutes * 60_000;
    return {
      metrics: {
        open: open.length,
        unassigned: open.filter((item) => !item.assigneeId).length,
        pending: conversations.filter((item) => item.status === "PENDING").length,
        resolved: closed.length,
        slaAtRisk: open.filter(
          (item) => item.lastInboundAt && item.lastInboundAt.getTime() < slaCutoff,
        ).length,
        averageFirstResponseMinutes: firstResponseSamples.length
          ? Math.round(firstResponseSamples.reduce((sum, value) => sum + value, 0) / firstResponseSamples.length)
          : 0,
      },
      volume: lastDays(7).map((day) => ({
        day: day.label,
        received: conversations.filter(
          (item) => dateKey(item.createdAt) === day.key,
        ).length,
        resolved: closed.filter((item) => dateKey(item.lastMessageAt) === day.key).length,
      })),
      channels: channelBreakdown(conversations),
      agents,
      recent: recent.map((item) => ({
        id: item.id,
        contact: item.contact?.displayName ?? "Unknown customer",
        channel: item.channel,
        preview: item.messages[0]?.text ?? "",
        status: item.status,
        assignee: item.assignee?.name,
        lastMessageAt: item.lastMessageAt,
      })),
    };
  }

  async analytics(context: TenantContext, requestedDays: number) {
    const days = Math.min(Math.max(requestedDays, 7), 90);
    const since = new Date(Date.now() - days * 86_400_000);
    const conversations = await db.conversation.findMany({
      where: { tenantId: context.tenantId, createdAt: { gte: since } },
      include: {
        assignee: { select: { id: true, name: true } },
        messages: { select: { direction: true, sentAt: true } },
      },
    });
    const resolved = conversations.filter((item) => item.status === "CLOSED");
    const responseMinutes = conversations.flatMap((conversation) => {
      const inbound = conversation.messages
        .filter((message) => message.direction === "INBOUND")
        .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())[0];
      const outbound = inbound
        ? conversation.messages
            .filter((message) => message.direction === "OUTBOUND" && message.sentAt >= inbound.sentAt)
            .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())[0]
        : undefined;
      return inbound && outbound ? [(outbound.sentAt.getTime() - inbound.sentAt.getTime()) / 60_000] : [];
    });
    const bucketSize = days <= 30 ? 1 : 7;
    const trend = lastDays(days)
      .filter((_day, index) => index % bucketSize === 0)
      .map((day, index, buckets) => {
        const end = buckets[index + 1]?.key;
        const inBucket = conversations.filter((item) => {
          const key = dateKey(item.createdAt);
          return key >= day.key && (!end || key < end);
        });
        return {
          label: day.label,
          conversations: inBucket.length,
          resolved: inBucket.filter((item) => item.status === "CLOSED").length,
        };
      });
    const agentMap = new Map<string, { id: string; name: string; assigned: number; resolved: number; replies: number }>();
    for (const conversation of conversations) {
      if (!conversation.assignee) continue;
      const current = agentMap.get(conversation.assignee.id) ?? {
        id: conversation.assignee.id,
        name: conversation.assignee.name,
        assigned: 0,
        resolved: 0,
        replies: 0,
      };
      current.assigned += 1;
      current.resolved += conversation.status === "CLOSED" ? 1 : 0;
      current.replies += conversation.messages.filter((message) => message.direction === "OUTBOUND").length;
      agentMap.set(current.id, current);
    }
    return {
      periodDays: days,
      metrics: {
        conversations: conversations.length,
        resolved: resolved.length,
        resolutionRate: conversations.length ? Math.round((resolved.length / conversations.length) * 100) : 0,
        averageFirstResponseMinutes: responseMinutes.length
          ? Math.round(responseMinutes.reduce((sum, value) => sum + value, 0) / responseMinutes.length)
          : 0,
        replies: conversations.reduce(
          (sum, item) => sum + item.messages.filter((message) => message.direction === "OUTBOUND").length,
          0,
        ),
      },
      trend,
      channels: channelBreakdown(conversations),
      agents: [...agentMap.values()].sort((a, b) => b.resolved - a.resolved),
    };
  }

  async agents(context: TenantContext) {
    const memberships = await db.membership.findMany({
      where: { tenantId: context.tenantId },
      include: { user: true },
      orderBy: [{ status: "asc" }, { user: { name: "asc" } }],
    });
    const workload = await db.conversation.groupBy({
      by: ["assigneeId", "status"],
      where: { tenantId: context.tenantId, assigneeId: { not: null } },
      _count: true,
    });
    return memberships.map((membership) => ({
      userId: membership.userId,
      name: membership.user.name,
      email: membership.user.email,
      avatarUrl: membership.user.avatarUrl,
      role: membership.role,
      status: membership.status,
      availability: membership.availability,
      capacity: membership.capacity,
      lastActiveAt: membership.lastActiveAt,
      openConversations:
        workload.find(
          (item) => item.assigneeId === membership.userId && item.status === "OPEN",
        )?._count ?? 0,
      resolvedConversations:
        workload.find(
          (item) => item.assigneeId === membership.userId && item.status === "CLOSED",
        )?._count ?? 0,
    }));
  }

  async inviteAgent(
    context: TenantContext,
    body: { email: string; name: string; role?: "ADMIN" | "AGENT"; capacity?: number },
  ) {
    this.requireAdmin(context);
    const email = body.email?.trim().toLowerCase();
    if (!email || !email.includes("@") || !body.name?.trim()) {
      throw new BadRequestException("A valid name and email are required");
    }
    const user = await db.user.upsert({
      where: { email },
      update: { name: body.name.trim() },
      create: { email, name: body.name.trim() },
    });
    const membership = await db.membership.upsert({
      where: { tenantId_userId: { tenantId: context.tenantId, userId: user.id } },
      update: {
        role: body.role ?? "AGENT",
        status: "INVITED",
        invitedAt: new Date(),
        capacity: clampCapacity(body.capacity),
      },
      create: {
        tenantId: context.tenantId,
        userId: user.id,
        role: body.role ?? "AGENT",
        status: "INVITED",
        invitedAt: new Date(),
        capacity: clampCapacity(body.capacity),
      },
    });
    await db.auditLog.create({
      data: {
        tenantId: context.tenantId,
        actorId: context.userId,
        action: "agent.invited",
        entityType: "Membership",
        entityId: user.id,
        after: { email, role: membership.role } as Prisma.InputJsonValue,
      },
    });
    return { ...membership, user };
  }

  async updateAgent(
    context: TenantContext,
    userId: string,
    body: {
      role?: "ADMIN" | "AGENT";
      status?: "ACTIVE" | "INVITED" | "SUSPENDED";
      availability?: "ONLINE" | "AWAY" | "OFFLINE";
      capacity?: number;
    },
  ) {
    this.requireAdmin(context);
    const membership = await db.membership.findUnique({
      where: { tenantId_userId: { tenantId: context.tenantId, userId } },
    });
    if (!membership) throw new NotFoundException("Agent not found");
    if (userId === context.userId && body.status === "SUSPENDED") {
      throw new BadRequestException("You cannot suspend your own account");
    }
    return db.membership.update({
      where: { tenantId_userId: { tenantId: context.tenantId, userId } },
      data: {
        role: body.role,
        status: body.status,
        availability: body.availability,
        capacity: body.capacity === undefined ? undefined : clampCapacity(body.capacity),
        joinedAt: body.status === "ACTIVE" && !membership.joinedAt ? new Date() : undefined,
      },
      include: { user: true },
    });
  }

  settings(context: TenantContext) {
    return db.tenant.findUnique({
      where: { id: context.tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        timezone: true,
        retentionDays: true,
        businessHours: true,
        firstResponseSlaMinutes: true,
        resolutionSlaMinutes: true,
        assignmentMode: true,
      },
    });
  }

  async updateSettings(
    context: TenantContext,
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
    this.requireAdmin(context);
    if (body.retentionDays !== undefined && (body.retentionDays < 30 || body.retentionDays > 3650)) {
      throw new BadRequestException("Retention must be between 30 and 3650 days");
    }
    const updated = await db.tenant.update({
      where: { id: context.tenantId },
      data: {
        name: body.name?.trim(),
        timezone: body.timezone,
        retentionDays: body.retentionDays,
        firstResponseSlaMinutes: body.firstResponseSlaMinutes,
        resolutionSlaMinutes: body.resolutionSlaMinutes,
        assignmentMode: body.assignmentMode,
        businessHours: body.businessHours as Prisma.InputJsonValue | undefined,
      },
    });
    await db.auditLog.create({
      data: {
        tenantId: context.tenantId,
        actorId: context.userId,
        action: "workspace.settings-updated",
        entityType: "Tenant",
        entityId: context.tenantId,
      },
    });
    return updated;
  }

  private requireAdmin(context: TenantContext) {
    if (context.role !== "ADMIN") throw new ForbiddenException("Admin role required");
  }
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function lastDays(count: number) {
  return Array.from({ length: count }, (_value, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (count - index - 1));
    return {
      key: dateKey(date),
      label: new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date),
    };
  });
}

function channelBreakdown(items: { channel: string }[]) {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.channel, (counts.get(item.channel) ?? 0) + 1);
  return [...counts.entries()]
    .map(([channel, count]) => ({
      channel,
      count,
      percentage: items.length ? Math.round((count / items.length) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

function clampCapacity(value?: number) {
  return Math.min(Math.max(Number(value) || 5, 1), 50);
}
