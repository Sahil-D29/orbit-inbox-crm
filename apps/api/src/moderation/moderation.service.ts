import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { TenantContext } from "@crm/contracts";
import { db } from "@crm/database";
import { TokenCipherService } from "../common/token-cipher.service";
import { EventStreamService } from "../common/event-stream.service";

@Injectable()
export class ModerationService {
  constructor(
    private readonly cipher: TokenCipherService,
    private readonly events: EventStreamService,
  ) {}

  async list(
    context: TenantContext,
    query: { status?: "OPEN" | "HIDDEN" | "RESOLVED"; q?: string },
  ) {
    return db.instagramComment.findMany({
      where: {
        tenantId: context.tenantId,
        status: query.status,
        ...(query.q
          ? {
              OR: [
                { text: { contains: query.q, mode: "insensitive" } },
                { authorName: { contains: query.q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { post: true, contact: true, assignee: { select: { id: true, name: true } } },
      orderBy: { commentedAt: "desc" },
      take: 100,
    });
  }

  async reply(context: TenantContext, id: string, text: string) {
    if (!text?.trim()) throw new BadRequestException("Reply text is required");
    const comment = await db.instagramComment.findFirst({
      where: { id, tenantId: context.tenantId },
      include: { post: { include: { connection: true } } },
    });
    if (!comment) throw new NotFoundException("Comment not found");
    const connection = comment.post.connection;
    if (!connection.encryptedAccessToken) throw new BadRequestException("Instagram connection needs attention");
    const response = await fetch(
      `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? "v25.0"}/${comment.externalId}/replies`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.cipher.decrypt(connection.encryptedAccessToken)}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ message: text }),
      },
    );
    if (!response.ok) throw new BadRequestException(`Instagram rejected the reply: ${await response.text()}`);
    await db.instagramComment.update({ where: { id }, data: { status: "RESOLVED" } });
    this.events.publish(context.tenantId, "comment.replied", { id });
    return { replied: true, provider: await response.json() };
  }

  async update(
    context: TenantContext,
    id: string,
    body: { status?: "OPEN" | "HIDDEN" | "RESOLVED"; hidden?: boolean; assigneeId?: string | null },
  ) {
    const comment = await db.instagramComment.findFirst({
      where: { id, tenantId: context.tenantId },
      include: { post: { include: { connection: true } } },
    });
    if (!comment) throw new NotFoundException("Comment not found");
    if (body.hidden !== undefined) {
      const connection = comment.post.connection;
      if (!connection.encryptedAccessToken) throw new BadRequestException("Instagram connection needs attention");
      const response = await fetch(
        `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? "v25.0"}/${comment.externalId}`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.cipher.decrypt(connection.encryptedAccessToken)}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ hide: body.hidden }),
        },
      );
      if (!response.ok) throw new BadRequestException(`Instagram moderation failed: ${await response.text()}`);
    }
    const updated = await db.instagramComment.update({
      where: { id },
      data: {
        status: body.hidden === true ? "HIDDEN" : body.status,
        isHidden: body.hidden,
        assigneeId: body.assigneeId,
      },
    });
    this.events.publish(context.tenantId, "comment.updated", { id });
    return updated;
  }
}
