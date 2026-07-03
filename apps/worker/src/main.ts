import type { NormalizedMessage } from "@crm/contracts";
import {
  db,
  DeliveryStatus,
  JobStatus,
  MessageDirection,
  Prisma,
  Provider,
} from "@crm/database";
import { Job, Queue, Worker } from "bullmq";
import { createDecipheriv } from "node:crypto";

const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };
const importsQueue = new Queue("history-imports", { connection });
const reconciliationQueue = new Queue("reconciliation", { connection });

const inboundWorker = new Worker(
  "inbound-events",
  async (job: Job<{ webhookEventId: string }>) => processInbound(job.data.webhookEventId),
  { connection, concurrency: 10 },
);
const outboundWorker = new Worker(
  "outbound-messages",
  async (job: Job<{ outboundJobId: string }>) => processOutbound(job.data.outboundJobId),
  { connection, concurrency: 10 },
);
const importWorker = new Worker(
  "history-imports",
  async (job: Job<{ tenantId: string; connectionId: string; cursor?: string }>) =>
    processImport(job.data),
  { connection, concurrency: 3 },
);
const reconciliationWorker = new Worker(
  "reconciliation",
  async (job: Job<{ connectionId?: string }>) => reconcile(job.data.connectionId),
  { connection, concurrency: 2 },
);

for (const worker of [inboundWorker, outboundWorker, importWorker, reconciliationWorker]) {
  worker.on("failed", (job, error) => console.error(`[${worker.name}] job ${job?.id} failed`, error));
  worker.on("error", (error) => console.error(`[${worker.name}] worker error`, error));
}

void reconciliationQueue.upsertJobScheduler(
  "periodic-reconciliation",
  { every: 15 * 60_000 },
  { name: "all-connections", data: {} },
);

async function processInbound(eventId: string) {
  const event = await db.webhookEvent.findUnique({
    where: { id: eventId },
    include: { connection: true },
  });
  if (!event || event.status === JobStatus.SUCCEEDED) return;
  if (!event.connection) throw new Error("Webhook event connection no longer exists");
  await db.webhookEvent.update({
    where: { id: event.id },
    data: { status: JobStatus.PROCESSING, attempts: { increment: 1 } },
  });
  try {
    if (event.provider === Provider.GMAIL) {
      const payload = event.payload as {
        notification?: { historyId?: string };
      };
      const cursor = await db.syncCursor.findUnique({
        where: {
          connectionId_resource: {
            connectionId: event.connection.id,
            resource: "gmail-history",
          },
        },
      });
      await ingestGmailHistory(event.connection.id, cursor?.cursor, payload.notification?.historyId);
    } else if (event.provider === Provider.INSTAGRAM_COMMENTS) {
      await ingestInstagramComments(event.tenantId, event.connection.id, event.payload);
    } else {
      const messages = normalizeMetaWebhook(event.payload);
      for (const message of messages) {
        await persistMessage(event.tenantId, event.connection.id, message);
      }
    }
    await db.webhookEvent.update({
      where: { id: event.id },
      data: { status: JobStatus.SUCCEEDED, processedAt: new Date(), error: null },
    });
  } catch (error) {
    await db.webhookEvent.update({
      where: { id: event.id },
      data: { status: JobStatus.FAILED, error: errorText(error) },
    });
    throw error;
  }
}

async function processOutbound(outboundJobId: string) {
  const outbound = await db.outboundJob.findUnique({
    where: { id: outboundJobId },
    include: {
      connection: true,
      conversation: {
        include: { messages: { where: { deliveryStatus: DeliveryStatus.QUEUED }, orderBy: { sentAt: "desc" }, take: 1 } },
      },
    },
  });
  if (!outbound || outbound.status === JobStatus.SUCCEEDED) return;
  await db.outboundJob.update({
    where: { id: outbound.id },
    data: { status: JobStatus.PROCESSING, attempts: { increment: 1 } },
  });
  const payload = outbound.payload as {
    recipientExternalId: string;
    text: string;
    template?: { name: string; language: string; components?: Record<string, unknown>[] };
    replyToExternalId?: string;
    localMessageId: string;
  };
  try {
    const externalMessageId =
      outbound.connection.provider === Provider.GMAIL
        ? await sendGmail(outbound.connection, outbound.conversation.externalId, payload)
        : await sendMeta(outbound.connection, payload);
    await db.$transaction([
      db.outboundJob.update({
        where: { id: outbound.id },
        data: { status: JobStatus.SUCCEEDED, externalMessageId, error: null },
      }),
      db.message.update({
        where: {
          tenantId_conversationId_externalId: {
            tenantId: outbound.tenantId,
            conversationId: outbound.conversationId,
            externalId: payload.localMessageId,
          },
        },
        data: { externalId: externalMessageId, deliveryStatus: DeliveryStatus.SENT },
      }),
    ]);
  } catch (error) {
    await db.$transaction([
      db.outboundJob.update({
        where: { id: outbound.id },
        data: { status: JobStatus.FAILED, error: errorText(error), nextAttemptAt: new Date(Date.now() + 60_000) },
      }),
      db.message.updateMany({
        where: {
          tenantId: outbound.tenantId,
          conversationId: outbound.conversationId,
          externalId: payload.localMessageId,
        },
        data: { deliveryStatus: DeliveryStatus.FAILED },
      }),
    ]);
    throw error;
  }
}

async function processImport(input: { tenantId: string; connectionId: string; cursor?: string }) {
  const connectionRecord = await db.channelConnection.findFirst({
    where: { id: input.connectionId, tenantId: input.tenantId },
  });
  if (!connectionRecord) return;
  if (connectionRecord.provider !== Provider.GMAIL) {
    await db.channelConnection.update({
      where: { id: connectionRecord.id },
      data: {
        lastSyncedAt: new Date(),
        metadata: {
          ...(connectionRecord.metadata as Record<string, unknown>),
          historyLimitation: "Meta exposes only provider-available history; WhatsApp pre-connection history is not guaranteed.",
        },
      },
    });
    return;
  }
  const token = decryptRequired(connectionRecord.encryptedAccessToken);
  const params = new URLSearchParams({ maxResults: "50" });
  if (input.cursor) params.set("pageToken", input.cursor);
  const list = await gmailFetch<{ messages?: { id: string }[]; nextPageToken?: string }>(
    token,
    `/messages?${params}`,
  );
  for (const message of list.messages ?? []) {
    const raw = await gmailFetch<Record<string, unknown>>(token, `/messages/${message.id}?format=full`);
    const normalized = normalizeGmail(raw);
    if (normalized) await persistMessage(input.tenantId, connectionRecord.id, normalized);
  }
  await db.channelConnection.update({
    where: { id: connectionRecord.id },
    data: { lastSyncedAt: new Date(), lastError: null },
  });
  if (list.nextPageToken) {
    await importsQueue.add(
      "backfill",
      { ...input, cursor: list.nextPageToken },
      { jobId: `backfill-${input.connectionId}-${list.nextPageToken}`, attempts: 5 },
    );
  }
}

async function reconcile(connectionId?: string) {
  const connections = await db.channelConnection.findMany({
    where: {
      id: connectionId,
      status: { in: ["CONNECTED", "DEGRADED"] },
    },
  });
  for (const connectionRecord of connections) {
    try {
      if (connectionRecord.provider === Provider.GMAIL) {
        const cursor = await db.syncCursor.findUnique({
          where: {
            connectionId_resource: {
              connectionId: connectionRecord.id,
              resource: "gmail-history",
            },
          },
        });
        if (cursor?.cursor) await ingestGmailHistory(connectionRecord.id, cursor.cursor);
        if (!cursor?.expiresAt || cursor.expiresAt.getTime() < Date.now() + 48 * 60 * 60_000) {
          await renewGmailWatch(connectionRecord.id);
        }
      }
      await db.channelConnection.update({
        where: { id: connectionRecord.id },
        data: { status: "CONNECTED", lastSyncedAt: new Date(), lastError: null },
      });
    } catch (error) {
      await db.channelConnection.update({
        where: { id: connectionRecord.id },
        data: { status: "DEGRADED", lastError: errorText(error) },
      });
    }
  }
}

async function ingestGmailHistory(connectionId: string, startHistoryId?: string | null, notifiedHistoryId?: string) {
  const connectionRecord = await db.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
  if (!startHistoryId) {
    await importsQueue.add("backfill", { tenantId: connectionRecord.tenantId, connectionId });
    return;
  }
  const token = decryptRequired(connectionRecord.encryptedAccessToken);
  const history = await gmailFetch<{
    history?: { messagesAdded?: { message: { id: string } }[] }[];
    historyId?: string;
  }>(token, `/history?startHistoryId=${encodeURIComponent(startHistoryId)}&historyTypes=messageAdded`);
  const ids = new Set(
    (history.history ?? []).flatMap((entry) =>
      (entry.messagesAdded ?? []).map((item) => item.message.id),
    ),
  );
  for (const id of ids) {
    const raw = await gmailFetch<Record<string, unknown>>(token, `/messages/${id}?format=full`);
    const normalized = normalizeGmail(raw);
    if (normalized) await persistMessage(connectionRecord.tenantId, connectionId, normalized);
  }
  await db.syncCursor.upsert({
    where: { connectionId_resource: { connectionId, resource: "gmail-history" } },
    update: { cursor: history.historyId ?? notifiedHistoryId ?? startHistoryId, lastSyncedAt: new Date() },
    create: {
      tenantId: connectionRecord.tenantId,
      connectionId,
      resource: "gmail-history",
      cursor: history.historyId ?? notifiedHistoryId ?? startHistoryId,
      lastSyncedAt: new Date(),
    },
  });
}

async function renewGmailWatch(connectionId: string) {
  if (!process.env.GOOGLE_PUBSUB_TOPIC) return;
  const connectionRecord = await db.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
  const token = decryptRequired(connectionRecord.encryptedAccessToken);
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/watch", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ topicName: process.env.GOOGLE_PUBSUB_TOPIC }),
  });
  if (!response.ok) throw new Error(`Gmail watch renewal failed: ${await response.text()}`);
  const watch = (await response.json()) as { historyId: string; expiration: string };
  await db.syncCursor.upsert({
    where: { connectionId_resource: { connectionId, resource: "gmail-history" } },
    update: { cursor: watch.historyId, expiresAt: new Date(Number(watch.expiration)) },
    create: {
      tenantId: connectionRecord.tenantId,
      connectionId,
      resource: "gmail-history",
      cursor: watch.historyId,
      expiresAt: new Date(Number(watch.expiration)),
    },
  });
}

async function persistMessage(tenantId: string, connectionId: string, message: NormalizedMessage) {
  const identity = await db.externalIdentity.findUnique({
    where: {
      tenantId_provider_externalId: {
        tenantId,
        provider: message.channel,
        externalId: message.sender.externalId,
      },
    },
    include: { contact: true },
  });
  let contactId = identity?.contactId;
  if (!contactId) {
    const contact = await db.contact.create({
      data: {
        tenantId,
        displayName: message.sender.displayName || message.sender.address || "Unknown contact",
        primaryEmail: message.channel === "GMAIL" ? message.sender.address : undefined,
        primaryPhone: message.channel === "WHATSAPP" ? message.sender.address : undefined,
        avatarUrl: message.sender.avatarUrl,
      },
    });
    contactId = contact.id;
    await db.externalIdentity.upsert({
      where: {
        tenantId_provider_externalId: {
          tenantId,
          provider: message.channel,
          externalId: message.sender.externalId,
        },
      },
      update: { contactId, displayName: message.sender.displayName, avatarUrl: message.sender.avatarUrl },
      create: {
        tenantId,
        connectionId,
        contactId,
        provider: message.channel,
        externalId: message.sender.externalId,
        address: message.sender.address,
        displayName: message.sender.displayName,
        avatarUrl: message.sender.avatarUrl,
        verified: true,
      },
    });
  }
  const sentAt = new Date(message.sentAt);
  const isInbound = message.direction === "INBOUND";
  const serviceWindowExpiresAt =
    message.channel === "WHATSAPP" && isInbound
      ? new Date(sentAt.getTime() + 24 * 60 * 60_000)
      : undefined;
  const conversation = await db.conversation.upsert({
    where: {
      tenantId_connectionId_externalId: {
        tenantId,
        connectionId,
        externalId: message.externalConversationId,
      },
    },
    update: {
      contactId,
      lastMessageAt: sentAt,
      lastInboundAt: isInbound ? sentAt : undefined,
      serviceWindowExpiresAt,
      unreadCount: isInbound ? { increment: 1 } : undefined,
      status: "OPEN",
      subject: message.subject,
    },
    create: {
      tenantId,
      connectionId,
      contactId,
      externalId: message.externalConversationId,
      channel: message.channel,
      subject: message.subject,
      lastMessageAt: sentAt,
      lastInboundAt: isInbound ? sentAt : undefined,
      serviceWindowExpiresAt,
      unreadCount: isInbound ? 1 : 0,
    },
  });
  await db.message.upsert({
    where: {
      tenantId_conversationId_externalId: {
        tenantId,
        conversationId: conversation.id,
        externalId: message.externalMessageId,
      },
    },
    update: {
      deliveryStatus: message.direction === "INBOUND" ? "DELIVERED" : "SENT",
    },
    create: {
      tenantId,
      conversationId: conversation.id,
      externalId: message.externalMessageId,
      providerEventId: message.providerEventId,
      direction: message.direction,
      deliveryStatus: message.direction === "INBOUND" ? "DELIVERED" : "SENT",
      senderExternalId: message.sender.externalId,
      subject: message.subject,
      text: message.text,
      sanitizedHtml: sanitizeHtml(message.html),
      replyToExternalId: message.replyToExternalId,
      sentAt,
      rawPayload: message.raw as Prisma.InputJsonValue,
      attachments: {
        create: message.attachments.map((attachment) => ({
          tenantId,
          externalId: attachment.externalId,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          providerUrl: attachment.providerUrl,
        })),
      },
    },
  });
}

async function ingestInstagramComments(tenantId: string, connectionId: string, payload: Prisma.JsonValue) {
  const root = payload as { entry?: { changes?: { field?: string; value?: Record<string, unknown> }[] }[] };
  for (const entry of root.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "comments" || !change.value) continue;
      const value = change.value;
      const commentId = String(value.id ?? "");
      const postExternalId = String(value.media_id ?? (value.media as { id?: string } | undefined)?.id ?? "");
      const from = value.from as { id?: string; username?: string } | undefined;
      if (!commentId || !postExternalId || !from?.id) continue;
      const post = await db.instagramPost.upsert({
        where: {
          tenantId_connectionId_externalId: {
            tenantId,
            connectionId,
            externalId: postExternalId,
          },
        },
        update: {},
        create: { tenantId, connectionId, externalId: postExternalId },
      });
      const identity = await db.externalIdentity.findUnique({
        where: {
          tenantId_provider_externalId: {
            tenantId,
            provider: Provider.INSTAGRAM_COMMENTS,
            externalId: from.id,
          },
        },
      });
      let contactId = identity?.contactId;
      if (!contactId) {
        const contact = await db.contact.create({
          data: { tenantId, displayName: from.username ?? "Instagram user" },
        });
        contactId = contact.id;
        await db.externalIdentity.upsert({
          where: {
            tenantId_provider_externalId: {
              tenantId,
              provider: Provider.INSTAGRAM_COMMENTS,
              externalId: from.id,
            },
          },
          update: { contactId },
          create: {
            tenantId,
            connectionId,
            contactId,
            provider: Provider.INSTAGRAM_COMMENTS,
            externalId: from.id,
            address: from.username,
            displayName: from.username,
          },
        });
      }
      await db.instagramComment.upsert({
        where: { tenantId_externalId: { tenantId, externalId: commentId } },
        update: { text: String(value.text ?? ""), isHidden: Boolean(value.hidden) },
        create: {
          tenantId,
          postId: post.id,
          contactId,
          externalId: commentId,
          parentExternalId: value.parent_id ? String(value.parent_id) : undefined,
          authorExternalId: from.id,
          authorName: from.username,
          text: String(value.text ?? ""),
          commentedAt: new Date(Number(value.created_time ?? Date.now() / 1000) * 1000),
        },
      });
    }
  }
}

function normalizeMetaWebhook(payload: Prisma.JsonValue): NormalizedMessage[] {
  const root = payload as { object?: string; entry?: Record<string, unknown>[] };
  const output: NormalizedMessage[] = [];
  for (const entry of root.entry ?? []) {
    for (const change of (entry.changes as { value?: Record<string, unknown> }[] | undefined) ?? []) {
      const value = change.value ?? {};
      for (const message of (value.messages as Record<string, unknown>[] | undefined) ?? []) {
        const from = String(message.from ?? "");
        const id = String(message.id ?? "");
        if (!from || !id) continue;
        output.push({
          providerEventId: id,
          externalMessageId: id,
          externalConversationId: from,
          channel: "WHATSAPP",
          direction: "INBOUND",
          sender: { provider: "WHATSAPP", externalId: from, address: from },
          recipients: [],
          text: String((message.text as { body?: string } | undefined)?.body ?? `[${message.type ?? "message"}]`),
          sentAt: new Date(Number(message.timestamp ?? Date.now() / 1000) * 1000).toISOString(),
          attachments: [],
          raw: message,
        });
      }
    }
    for (const event of (entry.messaging as Record<string, unknown>[] | undefined) ?? []) {
      const body = event.message as Record<string, unknown> | undefined;
      if (!body || body.is_echo) continue;
      const sender = String((event.sender as { id?: string } | undefined)?.id ?? "");
      const id = String(body.mid ?? "");
      if (!sender || !id) continue;
      const channel = root.object === "instagram" ? "INSTAGRAM_DM" : "FACEBOOK_MESSENGER";
      output.push({
        providerEventId: id,
        externalMessageId: id,
        externalConversationId: sender,
        channel,
        direction: "INBOUND",
        sender: { provider: channel, externalId: sender },
        recipients: [],
        text: String(body.text ?? "[attachment]"),
        sentAt: new Date(Number(event.timestamp ?? Date.now())).toISOString(),
        attachments: [],
        raw: event,
      });
    }
  }
  return output;
}

function normalizeGmail(raw: Record<string, unknown>): NormalizedMessage | null {
  const id = String(raw.id ?? "");
  const threadId = String(raw.threadId ?? "");
  const payload = raw.payload as {
    headers?: { name: string; value: string }[];
    body?: { data?: string };
    parts?: { mimeType?: string; body?: { data?: string } }[];
  } | undefined;
  if (!id || !threadId || !payload) return null;
  const headers = new Map((payload.headers ?? []).map((header) => [header.name.toLowerCase(), header.value]));
  const fromRaw = headers.get("from") ?? "unknown";
  const from = fromRaw.match(/<([^>]+)>/)?.[1] ?? fromRaw;
  const textPart = payload.parts?.find((part) => part.mimeType === "text/plain")?.body?.data;
  const htmlPart = payload.parts?.find((part) => part.mimeType === "text/html")?.body?.data;
  const labels = (raw.labelIds as string[] | undefined) ?? [];
  return {
    providerEventId: id,
    externalMessageId: id,
    externalConversationId: threadId,
    channel: "GMAIL",
    direction: labels.includes("SENT") ? "OUTBOUND" : "INBOUND",
    sender: {
      provider: "GMAIL",
      externalId: from,
      address: from,
      displayName: fromRaw.replace(/<.*>/, "").trim(),
    },
    recipients: [],
    subject: headers.get("subject"),
    text: decodeGmail(textPart ?? payload.body?.data) || String(raw.snippet ?? ""),
    html: decodeGmail(htmlPart),
    sentAt: new Date(Number(raw.internalDate ?? Date.now())).toISOString(),
    replyToExternalId: headers.get("in-reply-to"),
    attachments: [],
    raw,
  };
}

async function sendGmail(
  connectionRecord: { encryptedAccessToken: string | null; externalAccountId: string | null },
  threadId: string,
  payload: { recipientExternalId: string; text: string; replyToExternalId?: string },
) {
  const token = decryptRequired(connectionRecord.encryptedAccessToken);
  const headers = [
    `From: ${connectionRecord.externalAccountId ?? ""}`,
    `To: ${payload.recipientExternalId}`,
    "Content-Type: text/plain; charset=UTF-8",
    "MIME-Version: 1.0",
  ];
  if (payload.replyToExternalId) {
    headers.push(`In-Reply-To: ${payload.replyToExternalId}`, `References: ${payload.replyToExternalId}`);
  }
  const raw = Buffer.from(`${headers.join("\r\n")}\r\n\r\n${payload.text}`).toString("base64url");
  const result = await gmailFetch<{ id: string }>(token, "/messages/send", {
    method: "POST",
    body: JSON.stringify({ raw, threadId }),
  });
  return result.id;
}

async function sendMeta(
  connectionRecord: {
    provider: Provider;
    externalAccountId: string | null;
    encryptedAccessToken: string | null;
  },
  payload: {
    recipientExternalId: string;
    text: string;
    template?: { name: string; language: string; components?: Record<string, unknown>[] };
  },
) {
  const token = decryptRequired(connectionRecord.encryptedAccessToken);
  const body =
    connectionRecord.provider === Provider.WHATSAPP
      ? payload.template
        ? {
            messaging_product: "whatsapp",
            to: payload.recipientExternalId,
            type: "template",
            template: {
              name: payload.template.name,
              language: { code: payload.template.language },
              components: payload.template.components,
            },
          }
        : {
            messaging_product: "whatsapp",
            to: payload.recipientExternalId,
            type: "text",
            text: { body: payload.text, preview_url: false },
          }
      : {
          recipient: { id: payload.recipientExternalId },
          message: { text: payload.text },
          ...(connectionRecord.provider === Provider.FACEBOOK_MESSENGER
            ? { messaging_type: "RESPONSE" }
            : {}),
        };
  const response = await fetch(
    `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? "v25.0"}/${connectionRecord.externalAccountId}/messages`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) throw new Error(`Meta send failed (${response.status}): ${await response.text()}`);
  const result = (await response.json()) as { messages?: { id: string }[]; message_id?: string };
  return result.messages?.[0]?.id ?? result.message_id ?? crypto.randomUUID();
}

async function gmailFetch<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers },
  });
  if (!response.ok) throw new Error(`Gmail API failed (${response.status}): ${await response.text()}`);
  return (await response.json()) as T;
}

function decryptRequired(encrypted: string | null): string {
  if (!encrypted) throw new Error("Connection access token is missing");
  const keyText = process.env.TOKEN_ENCRYPTION_KEY;
  const key = keyText
    ? Buffer.from(keyText, "base64")
    : Buffer.from("development-key-do-not-use-00001", "utf8");
  const [ivText, tagText, cipherText] = encrypted.split(".");
  if (!ivText || !tagText || !cipherText || key.length !== 32) throw new Error("Encrypted token is invalid");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(cipherText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function decodeGmail(value?: string): string | undefined {
  return value ? Buffer.from(value, "base64url").toString("utf8") : undefined;
}

function sanitizeHtml(value?: string): string | undefined {
  if (!value) return undefined;
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, "")
    .replace(/javascript:/gi, "");
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 2_000) : String(error).slice(0, 2_000);
}

async function shutdown() {
  await Promise.all([
    inboundWorker.close(),
    outboundWorker.close(),
    importWorker.close(),
    reconciliationWorker.close(),
    importsQueue.close(),
    reconciliationQueue.close(),
    db.$disconnect(),
  ]);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
console.log("CRM workers started");
