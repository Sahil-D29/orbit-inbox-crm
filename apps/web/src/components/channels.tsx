"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { cleanApiError } from "@/lib/data";
import type { Connection } from "@/lib/types";
import { PageHeader, Icons } from "./ui";

export function Channels({ embedded = false }: { embedded?: boolean }) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [notice, setNotice] = useState<string>();
  const load = useCallback(() => api<Connection[]>("/connections").then(setConnections).catch(() => setConnections([
    { id: "gmail-preview", provider: "GMAIL", status: "CONNECTED", displayName: "support@example.com", lastSyncedAt: new Date().toISOString() },
    { id: "wa-preview", provider: "WHATSAPP", status: "CONNECTED", displayName: "Business WhatsApp", lastSyncedAt: new Date().toISOString() },
    { id: "ig-preview", provider: "INSTAGRAM_DM", status: "CONNECTED", displayName: "@yourbusiness", lastSyncedAt: new Date().toISOString() },
    { id: "igc-preview", provider: "INSTAGRAM_COMMENTS", status: "CONNECTED", displayName: "@yourbusiness comments", lastSyncedAt: new Date().toISOString() },
    { id: "fb-preview", provider: "FACEBOOK_MESSENGER", status: "CONNECTED", displayName: "Business Page", lastSyncedAt: new Date().toISOString() },
  ])), []);
  useEffect(() => void load(), [load]);
  const definitions = [
    { provider: "GMAIL", name: "Gmail", copy: "Email, threads, attachments, and replies", tone: "gmail" },
    { provider: "WHATSAPP", name: "WhatsApp Business", copy: "Cloud API messages, templates, and delivery status", tone: "whatsapp" },
    { provider: "INSTAGRAM_DM", name: "Instagram", copy: "Professional account DMs and comment moderation", tone: "instagram" },
    { provider: "FACEBOOK_MESSENGER", name: "Facebook Messenger", copy: "Facebook Page messages and replies", tone: "facebook" },
  ];
  async function connect(provider: string) {
    try { const data = await api<{ url: string }>(`/connections/${provider}/authorize`, { method: "POST" }); window.location.assign(data.url); }
    catch (error) { setNotice(cleanApiError(error instanceof Error ? error.message : "Connection failed")); }
  }
  const content = (
    <>
      {notice && <div className="error-notice page-error">{notice}</div>}
      {embedded && <div className="embedded-heading"><h2>Connected channels</h2><p>Official APIs connected directly to this workspace.</p></div>}
      <div className="channel-grid">
        {definitions.map((def) => {
          const matches = connections.filter((c) => c.provider === def.provider || (def.provider === "INSTAGRAM_DM" && c.provider === "INSTAGRAM_COMMENTS"));
          return <article className="channel-card panel" key={def.provider}><div className={`channel-logo ${def.tone}`}>{def.name[0]}</div><div className="channel-copy"><h3>{def.name}</h3><p>{def.copy}</p>{matches.map((c) => <div className="connection-status" key={c.id}><i className={c.status === "CONNECTED" ? "healthy" : ""} /><span>{c.displayName}</span><b>{c.status.toLowerCase()}</b></div>)}</div><button className={matches.length ? "secondary" : "primary"} onClick={() => void connect(def.provider)}>{matches.length ? "Add another" : "Connect"}</button></article>;
        })}
      </div>
      <div className="security-callout"><Icons.bolt /><div><strong>Direct connections by design</strong><p>OAuth tokens are encrypted at rest. Incoming events are signature-verified before entering your queue.</p></div></div>
    </>
  );
  if (embedded) return <div className="embedded-channels">{content}</div>;
  return <section className="wide-page settings-page"><PageHeader eyebrow="Settings" title="Connected channels" subtitle="Official APIs, direct to your workspace. No message aggregators in the middle." />{content}</section>;
}
