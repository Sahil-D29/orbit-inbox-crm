"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { getCachedMe } from "@/lib/auth";
import { previewItems, previewDetail } from "@/lib/data";
import type { View, InboxItem, Detail } from "@/lib/types";
import { Icons, initials } from "./ui";
import { Dashboard } from "./dashboard";
import { InboxShell } from "./inbox";
import { Comments } from "./comments";
import { Contacts } from "./contacts";
import { Analytics } from "./analytics";
import { Agents } from "./agents";
import { WorkspaceSettings } from "./settings";

const nav = [
  { id: "dashboard" as const, label: "Dashboard", icon: Icons.dashboard },
  { id: "inbox" as const, label: "Inbox", icon: Icons.inbox },
  { id: "comments" as const, label: "Comments", icon: Icons.message },
  { id: "contacts" as const, label: "Contacts", icon: Icons.users },
  { id: "analytics" as const, label: "Analytics", icon: Icons.chart },
  { id: "team" as const, label: "Agents", icon: Icons.users },
  { id: "settings" as const, label: "Settings", icon: Icons.settings },
];

export function CrmApp() {
  const [view, setView] = useState<View>("dashboard");
  const [items, setItems] = useState<InboxItem[]>([]);
  const [selected, setSelected] = useState<string>();
  const [detail, setDetail] = useState<Detail>();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("OPEN");
  const [channel, setChannel] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [previewMode, setPreviewMode] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [savedViews, setSavedViews] = useState<{ name: string; query: Record<string, unknown> }[]>([]);

  const me = getCachedMe();
  const currentMembership = me?.currentTenant;
  const userDisplayName = me?.user?.name ?? "Sahil";
  const userInitial = initials(userDisplayName);
  const userRole = currentMembership?.role === "ADMIN" ? "Administrator" : "Agent";

  useEffect(() => {
    void api<{ name: string; query: Record<string, unknown> }[]>("/saved-views")
      .then(setSavedViews)
      .catch(() => setSavedViews([
        { name: "Needs a reply", query: { status: "OPEN", unread: true } },
        { name: "Assigned to me", query: { status: "OPEN" } },
        { name: "Waiting", query: { status: "PENDING" } },
      ]));
  }, []);

  const loadInbox = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (query) params.set("q", query);
      if (channel) params.set("channel", channel);
      const data = await api<{ items: InboxItem[] }>(`/inbox?${params}`);
      setItems(data.items);
      setPreviewMode(false);
      setSelected((c) => c && data.items.some((i) => i.id === c) ? c : data.items[0]?.id);
      setError(undefined);
    } catch {
      const normalized = query.trim().toLowerCase();
      const filtered = previewItems.filter((item) =>
        item.status === status && (!channel || item.channel === channel) &&
        (!normalized || `${item.contact.name} ${item.subject} ${item.preview}`.toLowerCase().includes(normalized)));
      setItems(filtered);
      setPreviewMode(true);
      setSelected((c) => c && filtered.some((i) => i.id === c) ? c : filtered[0]?.id);
      setError(undefined);
    } finally { setLoading(false); }
  }, [channel, query, status]);

  useEffect(() => { const t = window.setTimeout(() => void loadInbox(), 180); return () => window.clearTimeout(t); }, [loadInbox]);

  useEffect(() => {
    if (!selected) { setDetail(undefined); return; }
    if (previewMode) { setDetail(previewItems.find((i) => i.id === selected) ? previewDetail(previewItems.find((i) => i.id === selected)!) : undefined); return; }
    void api<Detail>(`/conversations/${selected}`).then(setDetail).catch(() => {
      const p = previewItems.find((i) => i.id === selected);
      setDetail(p ? previewDetail(p) : undefined);
      setPreviewMode(true);
    });
  }, [selected, previewMode]);

  function applySavedView(savedView: { query: Record<string, unknown> }) {
    setView("inbox");
    const q = savedView.query;
    setStatus(String(q.status ?? "OPEN"));
    setChannel(String(q.channel ?? ""));
    setQuery(String(q.q ?? ""));
  }

  return (
    <main className="app-shell">
      <aside className="rail">
        <div className="brand-lockup">
          <button className="brand" aria-label="Orbit home"><span>O</span></button>
          <div><strong>Orbit</strong><span>Customer inbox</span></div>
        </div>
        <div className="rail-label">Workspace</div>
        <nav>
          {nav.map((item) => (
            <button key={item.id} className={view === item.id ? "nav-button active" : "nav-button"} onClick={() => setView(item.id)} title={item.label}>
              <item.icon />
              <span>{item.label}</span>
              {item.id === "inbox" && items.reduce((s, i) => s + i.unreadCount, 0) > 0 && <i>{items.reduce((s, i) => s + i.unreadCount, 0)}</i>}
            </button>
          ))}
        </nav>
        <div className="saved-nav">
          <div className="rail-label">Saved views</div>
          {savedViews.map((sv) => (
            <button key={sv.name} onClick={() => applySavedView(sv)}>
              <span className="view-dot" />{sv.name}
            </button>
          ))}
        </div>
        <div className="rail-bottom">
          <div className="avatar avatar-small">{userInitial}</div>
          <div className="rail-user"><strong>{userDisplayName}</strong><span>{userRole}</span></div>
          <button className="help-button">?</button>
        </div>
      </aside>

      {view === "dashboard" && <Dashboard onOpenInbox={() => setView("inbox")} />}
      {view === "inbox" && (
        <InboxShell
          items={items} selected={selected} detail={detail} query={query} status={status} channel={channel}
          loading={loading} error={error} previewMode={previewMode} mobileOpen={mobileOpen}
          onQuery={setQuery} onStatus={setStatus} onChannel={setChannel}
          onSelect={(id) => { setSelected(id); setMobileOpen(true); }}
          onRefresh={loadInbox} onDetail={setDetail} onCloseMobile={() => setMobileOpen(false)}
        />
      )}
      {view === "comments" && <Comments />}
      {view === "contacts" && <Contacts />}
      {view === "analytics" && <Analytics />}
      {view === "team" && <Agents />}
      {view === "settings" && <WorkspaceSettings />}
    </main>
  );
}
