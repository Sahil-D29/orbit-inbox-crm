import { BadGatewayException, Injectable } from "@nestjs/common";
import type {
  BackfillRequest,
  BackfillResult,
  NormalizedMessage,
  ProviderAdapter,
  SendMessageInput,
  SendMessageResult,
} from "@crm/contracts";
import { db } from "@crm/database";
import { TokenCipherService } from "../common/token-cipher.service";

interface GmailTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

@Injectable()
export class GmailAdapter implements ProviderAdapter {
  readonly provider = "GMAIL" as const;

  constructor(private readonly cipher: TokenCipherService) {}

  async getAuthorizationUrl(state: string, codeChallenge: string): Promise<string> {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: required("GOOGLE_CLIENT_ID"),
      redirect_uri: required("GOOGLE_REDIRECT_URI"),
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      scope: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.modify",
      ].join(" "),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    }).toString();
    return url.toString();
  }

  async exchangeAuthorizationCode(code: string, codeVerifier: string): Promise<Record<string, unknown>> {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: required("GOOGLE_CLIENT_ID"),
        client_secret: required("GOOGLE_CLIENT_SECRET"),
        redirect_uri: required("GOOGLE_REDIRECT_URI"),
        grant_type: "authorization_code",
        code,
        code_verifier: codeVerifier,
      }),
    });
    if (!response.ok) throw new BadGatewayException(`Google OAuth failed: ${await response.text()}`);
    return (await response.json()) as GmailTokenResponse as unknown as Record<string, unknown>;
  }

  async backfill(request: BackfillRequest): Promise<BackfillResult> {
    const token = await this.accessToken(request.connectionId);
    const query = new URLSearchParams({ maxResults: String(Math.min(request.limit ?? 50, 100)) });
    if (request.cursor) query.set("pageToken", request.cursor);
    const list = await gmailFetch<{ messages?: { id: string }[]; nextPageToken?: string }>(
      token,
      `/messages?${query}`,
    );
    const messages: NormalizedMessage[] = [];
    for (const item of list.messages ?? []) {
      const raw = await gmailFetch<Record<string, unknown>>(token, `/messages/${item.id}?format=full`);
      const normalized = normalizeGmailMessage(raw);
      if (normalized) messages.push(normalized);
    }
    return {
      messages,
      nextCursor: list.nextPageToken,
      complete: !list.nextPageToken,
    };
  }

  async normalizeWebhook(): Promise<NormalizedMessage[]> {
    // Gmail notifications carry only a history cursor. The worker calls reconcile.
    return [];
  }

  async reconcile(connectionId: string, cursor?: string): Promise<BackfillResult> {
    if (!cursor) return this.backfill({ tenantId: "", connectionId, limit: 50 });
    const token = await this.accessToken(connectionId);
    const history = await gmailFetch<{
      history?: { messagesAdded?: { message: { id: string } }[] }[];
      historyId?: string;
      nextPageToken?: string;
    }>(token, `/history?startHistoryId=${encodeURIComponent(cursor)}&historyTypes=messageAdded`);
    const ids = new Set(
      (history.history ?? []).flatMap((entry) =>
        (entry.messagesAdded ?? []).map((item) => item.message.id),
      ),
    );
    const messages: NormalizedMessage[] = [];
    for (const id of ids) {
      const raw = await gmailFetch<Record<string, unknown>>(token, `/messages/${id}?format=full`);
      const normalized = normalizeGmailMessage(raw);
      if (normalized) messages.push(normalized);
    }
    return {
      messages,
      nextCursor: history.historyId ?? cursor,
      complete: !history.nextPageToken,
    };
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    const token = await this.accessToken(input.connectionId);
    const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: input.connectionId } });
    const metadata = connection.metadata as Record<string, unknown>;
    const from = String(metadata.emailAddress ?? connection.externalAccountId ?? "");
    const headers = [
      `From: ${from}`,
      `To: ${input.recipientExternalId}`,
      "Content-Type: text/plain; charset=UTF-8",
      "MIME-Version: 1.0",
    ];
    if (input.replyToExternalId) {
      headers.push(`In-Reply-To: ${input.replyToExternalId}`, `References: ${input.replyToExternalId}`);
    }
    const raw = Buffer.from(`${headers.join("\r\n")}\r\n\r\n${input.text}`).toString("base64url");
    const result = await gmailFetch<{ id: string }>(token, "/messages/send", {
      method: "POST",
      body: JSON.stringify({ raw, threadId: input.conversationExternalId }),
    });
    return { externalMessageId: result.id, acceptedAt: new Date().toISOString(), status: "SENT" };
  }

  async refreshCredentials(connectionId: string): Promise<void> {
    const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
    if (!connection.encryptedRefreshToken) throw new Error("Gmail refresh token is missing");
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: required("GOOGLE_CLIENT_ID"),
        client_secret: required("GOOGLE_CLIENT_SECRET"),
        refresh_token: this.cipher.decrypt(connection.encryptedRefreshToken),
        grant_type: "refresh_token",
      }),
    });
    if (!response.ok) throw new Error(`Gmail token refresh failed: ${await response.text()}`);
    const token = (await response.json()) as GmailTokenResponse;
    await db.channelConnection.update({
      where: { id: connectionId },
      data: {
        encryptedAccessToken: this.cipher.encrypt(token.access_token),
        tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
        status: "CONNECTED",
        lastError: null,
      },
    });
  }

  async disconnect(connectionId: string): Promise<void> {
    const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
    if (connection.encryptedAccessToken) {
      await fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(this.cipher.decrypt(connection.encryptedAccessToken))}`,
        { method: "POST" },
      );
    }
    await db.channelConnection.update({
      where: { id: connectionId },
      data: {
        status: "DISCONNECTED",
        encryptedAccessToken: null,
        encryptedRefreshToken: null,
        tokenExpiresAt: null,
      },
    });
  }

  private async accessToken(connectionId: string): Promise<string> {
    let connection = await db.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
    if (connection.tokenExpiresAt && connection.tokenExpiresAt.getTime() < Date.now() + 60_000) {
      await this.refreshCredentials(connectionId);
      connection = await db.channelConnection.findUniqueOrThrow({ where: { id: connectionId } });
    }
    if (!connection.encryptedAccessToken) throw new Error("Gmail connection has no access token");
    return this.cipher.decrypt(connection.encryptedAccessToken);
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function gmailFetch<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers },
  });
  if (!response.ok) throw new Error(`Gmail API failed (${response.status}): ${await response.text()}`);
  return (await response.json()) as T;
}

function normalizeGmailMessage(raw: Record<string, unknown>): NormalizedMessage | null {
  const id = String(raw.id ?? "");
  const threadId = String(raw.threadId ?? "");
  const payload = raw.payload as { headers?: { name: string; value: string }[]; body?: { data?: string } } | undefined;
  if (!id || !threadId || !payload) return null;
  const headers = new Map((payload.headers ?? []).map((header) => [header.name.toLowerCase(), header.value]));
  const from = headers.get("from") ?? "unknown";
  const to = headers.get("to") ?? "";
  const fromAddress = from.match(/<([^>]+)>/)?.[1] ?? from;
  const internalDate = String(raw.internalDate ?? Date.now());
  const labels = (raw.labelIds as string[] | undefined) ?? [];
  return {
    providerEventId: id,
    externalMessageId: id,
    externalConversationId: threadId,
    channel: "GMAIL",
    direction: labels.includes("SENT") ? "OUTBOUND" : "INBOUND",
    sender: { provider: "GMAIL", externalId: fromAddress, address: fromAddress, displayName: from.replace(/<.*>/, "").trim() },
    recipients: to.split(",").filter(Boolean).map((address) => ({ provider: "GMAIL", externalId: address.trim(), address: address.trim() })),
    subject: headers.get("subject"),
    text: payload.body?.data ? Buffer.from(payload.body.data, "base64url").toString("utf8") : String(raw.snippet ?? ""),
    sentAt: new Date(Number(internalDate)).toISOString(),
    replyToExternalId: headers.get("in-reply-to"),
    attachments: [],
    raw,
  };
}
