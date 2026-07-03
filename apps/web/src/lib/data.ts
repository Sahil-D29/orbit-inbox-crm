import type { Channel, InboxItem, Detail, Agent, DashboardData, AnalyticsData } from "./types";

export const previewItems: InboxItem[] = [
  { id: "preview-wa", channel: "WHATSAPP", status: "OPEN", subject: "Order enquiry", preview: "Yes, please reserve one for me.", contact: { id: "aarav", name: "Aarav Mehta" }, unreadCount: 2, lastMessageAt: new Date(Date.now() - 3 * 60_000).toISOString(), assignee: { id: "sahil", name: "Sahil" }, labels: [{ id: "sales", name: "Sales lead", color: "#f59e0b" }], serviceWindowExpiresAt: new Date(Date.now() + 23 * 60 * 60_000).toISOString() },
  { id: "preview-mail", channel: "GMAIL", status: "OPEN", subject: "Invoice request", preview: "Could you share the invoice for my last order?", contact: { id: "maya", name: "Maya Kapoor" }, unreadCount: 1, lastMessageAt: new Date(Date.now() - 18 * 60_000).toISOString(), assignee: { id: "ananya", name: "Ananya Rao" }, labels: [{ id: "vip", name: "VIP", color: "#8b5cf6" }] },
  { id: "preview-ig", channel: "INSTAGRAM_DM", status: "OPEN", subject: "Instagram conversation", preview: "Is international shipping available?", contact: { id: "riya", name: "Riya Sharma" }, unreadCount: 0, lastMessageAt: new Date(Date.now() - 47 * 60_000).toISOString(), labels: [{ id: "sales", name: "Sales lead", color: "#f59e0b" }] },
  { id: "preview-fb", channel: "FACEBOOK_MESSENGER", status: "OPEN", subject: "Facebook conversation", preview: "Thank you, that solved it!", contact: { id: "kabir", name: "Kabir Singh" }, unreadCount: 0, lastMessageAt: new Date(Date.now() - 96 * 60_000).toISOString(), labels: [{ id: "vip", name: "VIP", color: "#8b5cf6" }] },
];

export function previewDetail(item: InboxItem): Detail {
  return {
    id: item.id, channel: item.channel, status: item.status, subject: item.subject,
    serviceWindowExpiresAt: item.serviceWindowExpiresAt, assignee: item.assignee,
    messages: [
      { id: `${item.id}-1`, direction: "INBOUND", text: item.preview, subject: item.channel === "GMAIL" ? item.subject : undefined, sentAt: item.lastMessageAt, deliveryStatus: "DELIVERED" },
      { id: `${item.id}-2`, direction: "OUTBOUND", text: item.channel === "WHATSAPP" ? "Absolutely — I've kept one aside for you. Would you like the payment link?" : "Thanks for reaching out. I'm checking this for you now.", sentAt: new Date(new Date(item.lastMessageAt).getTime() + 60_000).toISOString(), deliveryStatus: "READ" },
    ],
    contact: {
      id: item.contact.id, displayName: item.contact.name,
      primaryEmail: item.channel === "GMAIL" ? "maya@example.com" : undefined,
      primaryPhone: item.channel === "WHATSAPP" ? "+91 98100 01001" : undefined,
      identities: [{ id: `${item.id}-identity`, provider: item.channel, externalId: item.contact.id, address: item.channel === "GMAIL" ? "maya@example.com" : item.channel === "WHATSAPP" ? "+91 98100 01001" : `@${item.contact.name.toLowerCase().replace(" ", ".")}` }],
      notes: [{ id: "preview-note", body: "Interested in the premium collection. Follow up after delivery.", createdAt: new Date(Date.now() - 86_400_000).toISOString(), author: { name: "Sahil" } }],
      labels: item.labels.map((label) => ({ label })),
    },
  };
}

export const previewAgents: Agent[] = [
  { userId: "sahil", name: "Sahil", email: "sahil@example.com", role: "ADMIN", status: "ACTIVE", availability: "ONLINE", capacity: 6, openConversations: 3, resolvedConversations: 28 },
  { userId: "ananya", name: "Ananya Rao", email: "ananya@example.com", role: "AGENT", status: "ACTIVE", availability: "ONLINE", capacity: 5, openConversations: 2, resolvedConversations: 34 },
  { userId: "kabir-agent", name: "Kabir Joshi", email: "kabir@example.com", role: "AGENT", status: "ACTIVE", availability: "AWAY", capacity: 5, openConversations: 4, resolvedConversations: 19 },
];

export const previewDashboard: DashboardData = {
  metrics: { open: 12, unassigned: 3, pending: 5, resolved: 86, slaAtRisk: 2, averageFirstResponseMinutes: 14 },
  volume: [
    { day: "Jun 27", received: 18, resolved: 14 }, { day: "Jun 28", received: 24, resolved: 20 },
    { day: "Jun 29", received: 16, resolved: 17 }, { day: "Jun 30", received: 29, resolved: 22 },
    { day: "Jul 1", received: 26, resolved: 25 }, { day: "Jul 2", received: 34, resolved: 28 },
    { day: "Jul 3", received: 22, resolved: 18 },
  ],
  channels: [
    { channel: "WHATSAPP", count: 68, percentage: 40 }, { channel: "GMAIL", count: 47, percentage: 28 },
    { channel: "INSTAGRAM_DM", count: 36, percentage: 21 }, { channel: "FACEBOOK_MESSENGER", count: 18, percentage: 11 },
  ],
  agents: previewAgents,
  recent: previewItems.map((item) => ({
    id: item.id, contact: item.contact.name, channel: item.channel,
    preview: item.preview, status: item.status, assignee: item.assignee?.name, lastMessageAt: item.lastMessageAt,
  })),
};

export function previewAnalytics(days: number): AnalyticsData {
  const factor = days / 30;
  return {
    periodDays: days,
    metrics: { conversations: Math.round(684 * factor), resolved: Math.round(572 * factor), resolutionRate: 84, averageFirstResponseMinutes: 14, replies: Math.round(1042 * factor) },
    trend: previewDashboard.volume.map((item) => ({ label: item.day, conversations: item.received, resolved: item.resolved })),
    channels: previewDashboard.channels.map((item) => ({ ...item, count: Math.round(item.count * factor) })),
    agents: previewAgents.map((agent, index) => ({ id: agent.userId, name: agent.name, assigned: Math.round((110 - index * 18) * factor), resolved: Math.round((96 - index * 17) * factor), replies: Math.round((180 - index * 25) * factor) })),
  };
}

export function channelName(channel: Channel) {
  return { GMAIL: "Gmail", WHATSAPP: "WhatsApp", INSTAGRAM_DM: "Instagram", FACEBOOK_MESSENGER: "Messenger" }[channel] ?? channel;
}
export function titleCase(value: string) {
  return value.toLowerCase().replace(/(^|_)(\w)/g, (_match, _prefix, letter: string) => ` ${letter.toUpperCase()}`).trim();
}
export function exportAnalyticsCsv(data: AnalyticsData) {
  const rows = [["Agent", "Assigned", "Resolved", "Replies", "Resolution rate"], ...data.agents.map((agent) => [agent.name, agent.assigned, agent.resolved, agent.replies, `${agent.assigned ? Math.round((agent.resolved / agent.assigned) * 100) : 0}%`])];
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll("\"", "\"\"")}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = `crm-analytics-${data.periodDays}-days.csv`; link.click();
  URL.revokeObjectURL(url);
}
export function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}
export function relativeTime(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}
export function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
export function cleanApiError(value: string) {
  try { const parsed = JSON.parse(value) as { message?: string | string[] }; return Array.isArray(parsed.message) ? parsed.message.join(", ") : parsed.message ?? value; } catch { return value; }
}
