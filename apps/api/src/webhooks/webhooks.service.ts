import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { db, Prisma, Provider } from "@crm/database";
import { OAuth2Client } from "google-auth-library";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { QueueService } from "../common/queue.service";

interface GmailEnvelope {
  message?: { data?: string; messageId?: string; publishTime?: string };
  subscription?: string;
}

@Injectable()
export class WebhooksService {
  private readonly google = new OAuth2Client();

  constructor(private readonly queues: QueueService) {}

  async acceptMeta(payload: unknown, rawBody?: Buffer, signature?: string) {
    this.verifyMetaSignature(rawBody, signature);
    const root = payload as { object?: string; entry?: Record<string, unknown>[] };
    if (!root.object || !Array.isArray(root.entry)) throw new BadRequestException("Invalid Meta payload");
    const accepted: string[] = [];
    for (const entry of root.entry) {
      const assetId = String(entry.id ?? "");
      const providers = inferMetaProviders(root.object, entry);
      for (const provider of providers) {
        const connection = await db.channelConnection.findFirst({
          where: {
            provider,
            status: { in: ["CONNECTED", "DEGRADED"] },
            OR: [
              { externalAccountId: assetId },
              { metadata: { path: ["businessAccountId"], equals: assetId } },
              { metadata: { path: ["pageId"], equals: assetId } },
              { metadata: { path: ["instagramAccountId"], equals: assetId } },
            ],
          },
        });
        if (!connection) continue;
        const eventPayload = { object: root.object, entry: [entry] };
        const externalEventId = extractEventId(entry) ?? createHash("sha256")
          .update(JSON.stringify(eventPayload))
          .digest("hex");
        const event = await db.webhookEvent.upsert({
          where: {
            tenantId_provider_externalEventId: {
              tenantId: connection.tenantId,
              provider,
              externalEventId,
            },
          },
          update: {},
          create: {
            tenantId: connection.tenantId,
            connectionId: connection.id,
            provider,
            externalEventId,
            payload: eventPayload as unknown as Prisma.InputJsonValue,
          },
        });
        if (event.status === "PENDING") {
          await this.queues.inbound.add(
            "meta",
            { webhookEventId: event.id },
            { jobId: event.id, attempts: 8, backoff: { type: "exponential", delay: 1_000 } },
          );
        }
        accepted.push(event.id);
      }
    }
    return accepted;
  }

  async acceptGmail(envelope: GmailEnvelope, authorization?: string) {
    await this.verifyGoogleToken(authorization);
    const encoded = envelope.message?.data;
    if (!encoded) throw new BadRequestException("Gmail Pub/Sub data is missing");
    let notification: { emailAddress?: string; historyId?: string };
    try {
      notification = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as {
        emailAddress?: string;
        historyId?: string;
      };
    } catch {
      throw new BadRequestException("Gmail Pub/Sub data is invalid");
    }
    if (!notification.emailAddress || !notification.historyId) {
      throw new BadRequestException("Gmail notification is incomplete");
    }
    const connection = await db.channelConnection.findFirst({
      where: {
        provider: Provider.GMAIL,
        externalAccountId: notification.emailAddress,
        status: { in: ["CONNECTED", "DEGRADED"] },
      },
    });
    if (!connection) return;
    const externalEventId =
      envelope.message?.messageId ?? `${notification.emailAddress}:${notification.historyId}`;
    const event = await db.webhookEvent.upsert({
      where: {
        tenantId_provider_externalEventId: {
          tenantId: connection.tenantId,
          provider: Provider.GMAIL,
          externalEventId,
        },
      },
      update: {},
      create: {
        tenantId: connection.tenantId,
        connectionId: connection.id,
        provider: Provider.GMAIL,
        externalEventId,
        payload: { envelope, notification } as unknown as Prisma.InputJsonValue,
      },
    });
    if (event.status === "PENDING") {
      await this.queues.inbound.add(
        "gmail",
        { webhookEventId: event.id },
        { jobId: event.id, attempts: 8, backoff: { type: "exponential", delay: 1_000 } },
      );
    }
  }

  private verifyMetaSignature(rawBody?: Buffer, signature?: string) {
    const secret = process.env.META_APP_SECRET;
    if (!secret) {
      if (process.env.NODE_ENV === "production") throw new UnauthorizedException("Meta app secret is missing");
      return;
    }
    if (!rawBody || !signature?.startsWith("sha256=")) {
      throw new UnauthorizedException("Meta signature is missing");
    }
    const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"), "hex");
    const supplied = Buffer.from(signature.slice(7), "hex");
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      throw new UnauthorizedException("Meta signature is invalid");
    }
  }

  private async verifyGoogleToken(authorization?: string) {
    const audience = process.env.GOOGLE_PUBSUB_AUDIENCE;
    const expectedEmail = process.env.GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL;
    if (!audience || !expectedEmail) {
      if (process.env.NODE_ENV === "production") {
        throw new UnauthorizedException("Google Pub/Sub verification is not configured");
      }
      return;
    }
    const token = authorization?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) throw new UnauthorizedException("Google Pub/Sub token is missing");
    const ticket = await this.google.verifyIdToken({ idToken: token, audience });
    const payload = ticket.getPayload();
    if (!payload?.email_verified || payload.email !== expectedEmail) {
      throw new UnauthorizedException("Google Pub/Sub identity is invalid");
    }
  }
}

function inferMetaProviders(object: string, entry: Record<string, unknown>): Provider[] {
  if (object === "whatsapp_business_account") return [Provider.WHATSAPP];
  if (object === "instagram") {
    const changes = (entry.changes as { field?: string }[] | undefined) ?? [];
    const hasComment = changes.some((change) => change.field === "comments");
    const hasMessaging = Array.isArray(entry.messaging) || changes.some((change) => change.field === "messages");
    return [
      ...(hasComment ? [Provider.INSTAGRAM_COMMENTS] : []),
      ...(hasMessaging ? [Provider.INSTAGRAM_DM] : []),
    ];
  }
  if (object === "page") return [Provider.FACEBOOK_MESSENGER];
  return [];
}

function extractEventId(entry: Record<string, unknown>): string | undefined {
  const messaging = (entry.messaging as Record<string, unknown>[] | undefined)?.[0];
  const message = messaging?.message as Record<string, unknown> | undefined;
  if (message?.mid) return String(message.mid);
  const changes = entry.changes as { value?: Record<string, unknown> }[] | undefined;
  const value = changes?.[0]?.value;
  const wa = (value?.messages as Record<string, unknown>[] | undefined)?.[0];
  return String(wa?.id ?? value?.id ?? "") || undefined;
}
