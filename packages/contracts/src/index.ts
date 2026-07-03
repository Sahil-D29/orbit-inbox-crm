export type Channel = "GMAIL" | "WHATSAPP" | "INSTAGRAM_DM" | "FACEBOOK_MESSENGER";
export type ConnectionProvider = Channel | "INSTAGRAM_COMMENTS";
export type ConversationStatus = "OPEN" | "PENDING" | "CLOSED";
export type MessageDirection = "INBOUND" | "OUTBOUND";
export type DeliveryStatus = "QUEUED" | "SENT" | "DELIVERED" | "READ" | "FAILED";
export type UserRole = "ADMIN" | "AGENT";

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: UserRole;
}

export interface NormalizedIdentity {
  provider: ConnectionProvider;
  externalId: string;
  displayName?: string;
  address?: string;
  avatarUrl?: string;
}

export interface NormalizedAttachment {
  externalId?: string;
  fileName?: string;
  mimeType: string;
  sizeBytes?: number;
  providerUrl?: string;
}

export interface NormalizedMessage {
  providerEventId: string;
  externalMessageId: string;
  externalConversationId: string;
  channel: Channel;
  direction: MessageDirection;
  sender: NormalizedIdentity;
  recipients: NormalizedIdentity[];
  subject?: string;
  text?: string;
  html?: string;
  sentAt: string;
  replyToExternalId?: string;
  attachments: NormalizedAttachment[];
  raw: Record<string, unknown>;
}

export interface SendMessageInput {
  tenantId: string;
  connectionId: string;
  conversationExternalId: string;
  recipientExternalId: string;
  text: string;
  replyToExternalId?: string;
  template?: {
    name: string;
    language: string;
    components?: Record<string, unknown>[];
  };
}

export interface SendMessageResult {
  externalMessageId: string;
  acceptedAt: string;
  status: DeliveryStatus;
}

export interface BackfillRequest {
  tenantId: string;
  connectionId: string;
  cursor?: string;
  limit?: number;
}

export interface BackfillResult {
  messages: NormalizedMessage[];
  nextCursor?: string;
  complete: boolean;
  limitation?: string;
}

export interface ProviderAdapter {
  readonly provider: ConnectionProvider;
  getAuthorizationUrl(state: string, codeChallenge: string): Promise<string>;
  exchangeAuthorizationCode(code: string, codeVerifier: string): Promise<Record<string, unknown>>;
  backfill(request: BackfillRequest): Promise<BackfillResult>;
  normalizeWebhook(payload: unknown): Promise<NormalizedMessage[]>;
  reconcile(connectionId: string, cursor?: string): Promise<BackfillResult>;
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;
  refreshCredentials(connectionId: string): Promise<void>;
  disconnect(connectionId: string): Promise<void>;
}

export interface InboxQuery {
  status?: ConversationStatus;
  channel?: Channel;
  assigneeId?: string;
  labelId?: string;
  unread?: boolean;
  q?: string;
  cursor?: string;
  limit?: number;
}

export interface InboxItem {
  id: string;
  channel: Channel;
  status: ConversationStatus;
  subject: string;
  preview: string;
  contact: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
  unreadCount: number;
  lastMessageAt: string;
  assignee?: { id: string; name: string };
  labels: { id: string; name: string; color: string }[];
  serviceWindowExpiresAt?: string;
}
