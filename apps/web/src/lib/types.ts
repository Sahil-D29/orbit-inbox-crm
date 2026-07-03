export type View = "dashboard" | "inbox" | "comments" | "contacts" | "analytics" | "team" | "settings";
export type Channel = "GMAIL" | "WHATSAPP" | "INSTAGRAM_DM" | "FACEBOOK_MESSENGER";
export type InboxItem = {
  id: string; channel: Channel; status: "OPEN" | "PENDING" | "CLOSED";
  subject: string; preview: string;
  contact: { id: string; name: string; avatarUrl?: string };
  unreadCount: number; lastMessageAt: string;
  assignee?: { id: string; name: string };
  labels: { id: string; name: string; color: string }[];
  serviceWindowExpiresAt?: string;
};
export type Detail = {
  id: string; channel: Channel; status: string; subject?: string;
  serviceWindowExpiresAt?: string; assignee?: { name: string };
  messages: { id: string; direction: "INBOUND" | "OUTBOUND"; text?: string; subject?: string; sentAt: string; deliveryStatus: string }[];
  contact?: {
    id: string; displayName: string; primaryEmail?: string; primaryPhone?: string;
    identities: { id: string; provider: string; externalId: string; address?: string; displayName?: string }[];
    notes: { id: string; body: string; createdAt: string; author: { name: string } }[];
    labels: { label: { id: string; name: string; color: string } }[];
  };
};
export type CommentItem = {
  id: string; text: string; status: string; isHidden: boolean;
  authorName?: string; commentedAt: string;
  post: { caption?: string; permalink?: string };
  contact?: { displayName: string };
};
export type Connection = {
  id: string; provider: string; status: string; displayName: string;
  lastSyncedAt?: string; lastError?: string;
};
export type Agent = {
  userId: string; name: string; email: string; role: "ADMIN" | "AGENT";
  status: "ACTIVE" | "INVITED" | "SUSPENDED";
  availability: "ONLINE" | "AWAY" | "OFFLINE";
  capacity: number; openConversations: number; resolvedConversations: number; lastActiveAt?: string;
};
export type DashboardData = {
  metrics: { open: number; unassigned: number; pending: number; resolved: number; slaAtRisk: number; averageFirstResponseMinutes: number };
  volume: { day: string; received: number; resolved: number }[];
  channels: { channel: string; count: number; percentage: number }[];
  agents: Agent[];
  recent: { id: string; contact: string; channel: Channel; preview: string; status: string; assignee?: string; lastMessageAt: string }[];
};
export type AnalyticsData = {
  periodDays: number;
  metrics: { conversations: number; resolved: number; resolutionRate: number; averageFirstResponseMinutes: number; replies: number };
  trend: { label: string; conversations: number; resolved: number }[];
  channels: { channel: string; count: number; percentage: number }[];
  agents: { id: string; name: string; assigned: number; resolved: number; replies: number }[];
};
export type WorkspaceSettings = {
  name: string; timezone: string; retentionDays: number;
  firstResponseSlaMinutes: number; resolutionSlaMinutes: number;
  assignmentMode: string;
  businessHours: { days: number[]; start: string; end: string };
};
