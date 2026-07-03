import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { TenantContext } from "@crm/contracts";
import { db, Prisma } from "@crm/database";

@Injectable()
export class ContactsService {
  list(context: TenantContext, q?: string) {
    return db.contact.findMany({
      where: {
        tenantId: context.tenantId,
        mergedIntoId: null,
        ...(q
          ? {
              OR: [
                { displayName: { contains: q, mode: "insensitive" } },
                { primaryEmail: { contains: q, mode: "insensitive" } },
                { primaryPhone: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { identities: true, labels: { include: { label: true } } },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
  }

  async detail(context: TenantContext, id: string) {
    const contact = await db.contact.findFirst({
      where: { id, tenantId: context.tenantId },
      include: {
        identities: true,
        labels: { include: { label: true } },
        notes: { include: { author: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } },
        conversations: {
          include: { messages: { orderBy: { sentAt: "desc" }, take: 1 } },
          orderBy: { lastMessageAt: "desc" },
        },
        comments: { include: { post: true }, orderBy: { commentedAt: "desc" } },
      },
    });
    if (!contact) throw new NotFoundException("Contact not found");
    return contact;
  }

  suggestions(context: TenantContext) {
    return db.contactMerge.findMany({
      where: { tenantId: context.tenantId, status: "SUGGESTED" },
      include: { sourceContact: true, targetContact: true },
      orderBy: { score: "desc" },
    });
  }

  async addNote(context: TenantContext, id: string, body: string) {
    if (!body?.trim()) throw new BadRequestException("Note body is required");
    await this.requireContact(context.tenantId, id);
    return db.note.create({
      data: { tenantId: context.tenantId, contactId: id, authorId: context.userId, body: body.trim() },
      include: { author: { select: { id: true, name: true } } },
    });
  }

  async merge(context: TenantContext, sourceId: string, targetId: string) {
    if (sourceId === targetId) throw new BadRequestException("Select two different contacts");
    const [source, target] = await Promise.all([
      this.requireContact(context.tenantId, sourceId),
      this.requireContact(context.tenantId, targetId),
    ]);
    if (source.mergedIntoId || target.mergedIntoId) throw new BadRequestException("A selected contact is already merged");
    const snapshot = await db.$transaction(async (tx) => {
      const [identities, conversations, comments, notes] = await Promise.all([
        tx.externalIdentity.findMany({ where: { tenantId: context.tenantId, contactId: sourceId }, select: { id: true } }),
        tx.conversation.findMany({ where: { tenantId: context.tenantId, contactId: sourceId }, select: { id: true } }),
        tx.instagramComment.findMany({ where: { tenantId: context.tenantId, contactId: sourceId }, select: { id: true } }),
        tx.note.findMany({ where: { tenantId: context.tenantId, contactId: sourceId }, select: { id: true } }),
      ]);
      const record = {
        identityIds: identities.map(({ id }) => id),
        conversationIds: conversations.map(({ id }) => id),
        commentIds: comments.map(({ id }) => id),
        noteIds: notes.map(({ id }) => id),
      };
      await Promise.all([
        tx.externalIdentity.updateMany({ where: { id: { in: record.identityIds } }, data: { contactId: targetId } }),
        tx.conversation.updateMany({ where: { id: { in: record.conversationIds } }, data: { contactId: targetId } }),
        tx.instagramComment.updateMany({ where: { id: { in: record.commentIds } }, data: { contactId: targetId } }),
        tx.note.updateMany({ where: { id: { in: record.noteIds } }, data: { contactId: targetId } }),
        tx.contact.update({ where: { id: sourceId }, data: { mergedIntoId: targetId } }),
      ]);
      const merge = await tx.contactMerge.create({
        data: {
          tenantId: context.tenantId,
          sourceContactId: sourceId,
          targetContactId: targetId,
          status: "CONFIRMED",
          snapshot: record,
          confirmedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: context.tenantId,
          actorId: context.userId,
          action: "contact.merged",
          entityType: "ContactMerge",
          entityId: merge.id,
          before: { source, target } as unknown as Prisma.InputJsonValue,
          after: record,
        },
      });
      return merge;
    });
    return snapshot;
  }

  async undoMerge(context: TenantContext, mergeId: string) {
    const merge = await db.contactMerge.findFirst({
      where: { id: mergeId, tenantId: context.tenantId, status: "CONFIRMED" },
    });
    if (!merge) throw new NotFoundException("Active merge not found");
    const snapshot = merge.snapshot as {
      identityIds?: string[];
      conversationIds?: string[];
      commentIds?: string[];
      noteIds?: string[];
    };
    await db.$transaction(async (tx) => {
      await Promise.all([
        tx.externalIdentity.updateMany({ where: { id: { in: snapshot.identityIds ?? [] } }, data: { contactId: merge.sourceContactId } }),
        tx.conversation.updateMany({ where: { id: { in: snapshot.conversationIds ?? [] } }, data: { contactId: merge.sourceContactId } }),
        tx.instagramComment.updateMany({ where: { id: { in: snapshot.commentIds ?? [] } }, data: { contactId: merge.sourceContactId } }),
        tx.note.updateMany({ where: { id: { in: snapshot.noteIds ?? [] } }, data: { contactId: merge.sourceContactId } }),
        tx.contact.update({ where: { id: merge.sourceContactId }, data: { mergedIntoId: null } }),
        tx.contactMerge.update({ where: { id: merge.id }, data: { status: "UNDONE", undoneAt: new Date() } }),
      ]);
      await tx.auditLog.create({
        data: {
          tenantId: context.tenantId,
          actorId: context.userId,
          action: "contact.merge-undone",
          entityType: "ContactMerge",
          entityId: merge.id,
        },
      });
    });
    return { undone: true };
  }

  private async requireContact(tenantId: string, id: string) {
    const contact = await db.contact.findFirst({ where: { id, tenantId } });
    if (!contact) throw new NotFoundException("Contact not found");
    return contact;
  }
}
