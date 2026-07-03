import { BadRequestException, Injectable } from "@nestjs/common";
import type {
  BackfillRequest,
  BackfillResult,
  ConnectionProvider,
  NormalizedMessage,
  ProviderAdapter,
  SendMessageInput,
  SendMessageResult,
} from "@crm/contracts";
import { db } from "@crm/database";
import { TokenCipherService } from "../common/token-cipher.service";

@Injectable()
export class MetaAdapter implements ProviderAdapter {
  readonly provider: ConnectionProvider = "WHATSAPP";
  private activeProvider: ConnectionProvider = "WHATSAPP";

  constructor(private readonly cipher: TokenCipherService) {}

  forProvider(provider: ConnectionProvider): MetaAdapter {
    const adapter = Object.create(this) as MetaAdapter;
    adapter.activeProvider = provider;
    Object.defineProperty(adapter, "provider", { value: provider });
    return adapter;
  }

  async getAuthorizationUrl(state: string, codeChallenge: string): Promise<string> {
    const scopes = [
      "business_management",
      "whatsapp_business_management",
      "whatsapp_business_messaging",
      "instagram_business_basic",
      "instagram_business_manage_messages",
      "instagram_business_manage_comments",
      "pages_show_list",
      "pages_manage_metadata",
      "pages_messaging",
    ];
    const url = new URL(`${graphOrigin()}/dialog/oauth`);
    url.hostname = "www.facebook.com";
    url.search = new URLSearchParams({
      client_id: required("META_APP_ID"),
      redirect_uri: required("META_REDIRECT_URI"),
      response_type: "code",
      scope: scopes.join(","),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    }).toString();
    return url.toString();
  }

  async exchangeAuthorizationCode(code: string, codeVerifier: string): Promise<Record<string, unknown>> {
    const query = new URLSearchParams({
      client_id: required("META_APP_ID"),
      client_secret: required("META_APP_SECRET"),
      redirect_uri: required("META_REDIRECT_URI"),
      code,
      code_verifier: codeVerifier,
    });
    const response = await fetch(`${graphBase()}/oauth/access_token?${query}`);
    if (!response.ok) throw new Error(`Meta OAuth failed: ${await response.text()}`);
    return (await response.json()) as Record<string, unknown>;
  }

  async backfill(_request: BackfillRequest): Promise<BackfillResult> {
    return {
      messages: [],
      complete: true,
      limitation:
        this.activeProvider === "WHATSAPP"
          ? "WhatsApp Cloud API does not guarantee pre-connection history."
          : "Meta history availability depends on account type, permissions, and API retention.",
    };
  }

  async normalizeWebhook(payload: unknown): Promise<NormalizedMessage[]> {
    const root = payload as { object?: string; entry?: Record<string, unknown>[] };
    const messages: NormalizedMessage[] = [];
    for (const entry of root.entry ?? []) {
      const changes = (entry.changes as { field?: string; value?: Record<string, unknown> }[] | undefined) ?? [];
      for (const change of changes) {
        const value = change.value ?? {};
        const waMessages = (value.messages as Record<string, unknown>[] | undefined) ?? [];
        for (const message of waMessages) {
          const from = String(message.from ?? "");
          const id = String(message.id ?? "");
          const text = (message.text as { body?: string } | undefined)?.body ?? `[${String(message.type ?? "message")}]`;
          if (!from || !id) continue;
          messages.push({
            providerEventId: id,
            externalMessageId: id,
            externalConversationId: from,
            channel: "WHATSAPP",
            direction: "INBOUND",
            sender: { provider: "WHATSAPP", externalId: from, address: from },
            recipients: [],
            text,
            sentAt: new Date(Number(message.timestamp ?? Date.now() / 1000) * 1000).toISOString(),
            attachments: [],
            raw: message,
          });
        }
      }
      const messaging = (entry.messaging as Record<string, unknown>[] | undefined) ?? [];
      for (const event of messaging) {
        const body = event.message as Record<string, unknown> | undefined;
        if (!body || body.is_echo) continue;
        const sender = String((event.sender as { id?: string } | undefined)?.id ?? "");
        const id = String(body.mid ?? "");
        if (!sender || !id) continue;
        const channel = root.object === "instagram" ? "INSTAGRAM_DM" : "FACEBOOK_MESSENGER";
        messages.push({
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
    return messages;
  }

  async reconcile(connectionId: string): Promise<BackfillResult> {
    return this.backfill({ tenantId: "", connectionId });
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    const connection = await db.channelConnection.findUniqueOrThrow({ where: { id: input.connectionId } });
    if (!connection.encryptedAccessToken) throw new Error("Meta connection has no access token");
    const token = this.cipher.decrypt(connection.encryptedAccessToken);
    let endpoint: string;
    let body: Record<string, unknown>;
    if (connection.provider === "WHATSAPP") {
      endpoint = `/${connection.externalAccountId}/messages`;
      if (!input.template && this.isOutsideServiceWindow(input.conversationExternalId)) {
        throw new BadRequestException("An approved WhatsApp template is required outside the service window");
      }
      body = input.template
        ? {
            messaging_product: "whatsapp",
            to: input.recipientExternalId,
            type: "template",
            template: {
              name: input.template.name,
              language: { code: input.template.language },
              components: input.template.components,
            },
          }
        : {
            messaging_product: "whatsapp",
            to: input.recipientExternalId,
            type: "text",
            text: { body: input.text, preview_url: false },
          };
    } else {
      endpoint = `/${connection.externalAccountId}/messages`;
      body = {
        recipient: { id: input.recipientExternalId },
        message: { text: input.text },
        messaging_type: connection.provider === "FACEBOOK_MESSENGER" ? "RESPONSE" : undefined,
      };
    }
    const response = await fetch(`${graphBase()}${endpoint}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Meta send failed (${response.status}): ${await response.text()}`);
    const result = (await response.json()) as { messages?: { id: string }[]; message_id?: string };
    return {
      externalMessageId: result.messages?.[0]?.id ?? result.message_id ?? crypto.randomUUID(),
      acceptedAt: new Date().toISOString(),
      status: "SENT",
    };
  }

  async refreshCredentials(): Promise<void> {
    // Meta long-lived/system-user token rotation is an administrative workflow.
  }

  async disconnect(connectionId: string): Promise<void> {
    await db.channelConnection.update({
      where: { id: connectionId },
      data: { status: "DISCONNECTED", encryptedAccessToken: null, encryptedRefreshToken: null },
    });
  }

  private isOutsideServiceWindow(_externalConversationId: string): boolean {
    // The API service validates the persisted conversation window before enqueueing.
    return false;
  }
}

function graphBase(): string {
  return `${graphOrigin()}/${process.env.META_GRAPH_VERSION ?? "v25.0"}`;
}

function graphOrigin(): string {
  return "https://graph.facebook.com";
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
