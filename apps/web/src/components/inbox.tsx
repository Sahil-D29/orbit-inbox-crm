"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { previewItems, previewDetail, channelName, relativeTime, formatTime, initials, cleanApiError } from "@/lib/data";
import type { InboxItem, Detail, Channel } from "@/lib/types";
import { Avatar, ChannelMark, Icons } from "./ui";

export function InboxShell(props: {
  items: InboxItem[]; selected?: string; detail?: Detail; query: string; status: string; channel: string;
  loading: boolean; error?: string;
  onQuery: (v: string) => void; onStatus: (v: string) => void; onChannel: (v: string) => void;
  onSelect: (v: string) => void; onRefresh: () => Promise<void>; onDetail: (v: Detail) => void;
  previewMode: boolean; mobileOpen: boolean; onCloseMobile: () => void;
}) {
  return (
    <section className="workspace">
      <div className="conversation-list">
        <header className="list-header">
          <div className="eyebrow">Workspace</div>
          <div className="heading-row">
            <h1>Inbox</h1>
            <span className="live-indicator"><i /> Live</span>
          </div>
          <div className="search-box">
            <Icons.search />
            <input value={props.query} onChange={(e) => props.onQuery(e.target.value)} placeholder="Search conversations" />
            <kbd>⌘K</kbd>
          </div>
          <div className="tabs">
            {[["OPEN", "Open"], ["PENDING", "Pending"], ["CLOSED", "Closed"]].map(([value, label]) => (
              <button key={value} onClick={() => props.onStatus(value)} className={props.status === value ? "active" : ""}>{label}</button>
            ))}
            <label className="channel-filter">
              <Icons.filter />
              <select value={props.channel} onChange={(e) => props.onChannel(e.target.value)}>
                <option value="">All channels</option>
                <option value="GMAIL">Gmail</option>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="INSTAGRAM_DM">Instagram</option>
                <option value="FACEBOOK_MESSENGER">Messenger</option>
              </select>
            </label>
          </div>
        </header>
        <div className="list-meta">
          <label><input type="checkbox" /> {props.items.length} conversations</label>
          <button>Newest <span>⌄</span></button>
        </div>
        <div className="inbox-items">
          {props.loading && <div className="empty-state"><div className="spinner" />Gathering conversations…</div>}
          {props.error && !props.loading && <div className="empty-state"><Icons.bolt /><strong>Waiting for the backend</strong><span>{props.error}</span></div>}
          {!props.loading && !props.error && props.items.length === 0 && <div className="empty-state"><Icons.check /><strong>All caught up</strong><span>No conversations match this view.</span></div>}
          {props.items.map((item) => (
            <button key={item.id} className={props.selected === item.id ? "inbox-row selected" : "inbox-row"} onClick={() => props.onSelect(item.id)}>
              <input type="checkbox" onClick={(e) => e.stopPropagation()} />
              <Avatar name={item.contact.name} image={item.contact.avatarUrl} online={item.channel === "WHATSAPP"} />
              <div className="row-copy">
                <div className="row-title"><strong>{item.contact.name}</strong><time>{relativeTime(item.lastMessageAt)}</time></div>
                <div className="row-subject"><ChannelMark channel={item.channel} /><b>{item.subject}</b></div>
                <p>{item.preview}</p>
                <div className="row-labels">
                  {item.labels.map((label) => <span key={label.id} style={{ "--label": label.color } as React.CSSProperties}>{label.name}</span>)}
                  {item.assignee && <span className="assignee-mini">{initials(item.assignee.name)} {item.assignee.name}</span>}
                </div>
              </div>
              {item.unreadCount > 0 && <em className="unread">{item.unreadCount}</em>}
            </button>
          ))}
        </div>
      </div>
      <ConversationPane detail={props.detail} onRefresh={props.onRefresh} onDetail={props.onDetail} previewMode={props.previewMode} mobileOpen={props.mobileOpen} onCloseMobile={props.onCloseMobile} />
      <CustomerPane detail={props.detail} />
    </section>
  );
}

function ConversationPane({ detail, onRefresh, onDetail, previewMode, mobileOpen, onCloseMobile }: {
  detail?: Detail; onRefresh: () => Promise<void>; onDetail: (d: Detail) => void;
  previewMode: boolean; mobileOpen: boolean; onCloseMobile: () => void;
}) {
  const [reply, setReply] = useState(""); const [sending, setSending] = useState(false); const [notice, setNotice] = useState<string>();
  if (!detail) return <section className="conversation-pane empty-conversation"><Icons.message /><h2>Select a conversation</h2><p>The complete customer history will appear here.</p></section>;
  const d = detail;
  const windowClosed = d.channel === "WHATSAPP" && (!d.serviceWindowExpiresAt || new Date(d.serviceWindowExpiresAt) < new Date());
  async function send() {
    if (!reply.trim()) return; setSending(true); setNotice(undefined);
    if (previewMode) { onDetail({ ...d, messages: [...d.messages, { id: crypto.randomUUID(), direction: "OUTBOUND", text: reply.trim(), sentAt: new Date().toISOString(), deliveryStatus: "SENT" }] }); setReply(""); setSending(false); setNotice("Preview reply added locally."); return; }
    try { await api(`/conversations/${d.id}/reply`, { method: "POST", headers: { "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ text: reply }) }); setReply(""); const fresh = await api<Detail>(`/conversations/${d.id}`); onDetail(fresh); await onRefresh(); } catch (error) { setNotice(cleanApiError(error instanceof Error ? error.message : "Reply failed")); } finally { setSending(false); }
  }
  async function setConversationStatus(next: "OPEN" | "PENDING" | "CLOSED") {
    if (previewMode) { onDetail({ ...d, status: next }); setNotice(`Conversation marked ${next.toLowerCase()}.`); return; }
    await api(`/conversations/${d.id}`, { method: "PATCH", body: JSON.stringify({ status: next }) }); await onRefresh();
  }
  return (
    <section className={`conversation-pane ${mobileOpen ? "mobile-open" : ""}`}>
      <header className="conversation-header">
        <button className="mobile-back" onClick={onCloseMobile}>←</button>
        <div><div className="conversation-person"><Avatar name={d.contact?.displayName ?? "Unknown"} /><div><h2>{d.contact?.displayName ?? "Unknown contact"}</h2><span><ChannelMark channel={d.channel} /> {channelName(d.channel)}</span></div></div></div>
        <div className="header-actions">
          <button title="Mark pending" onClick={() => void setConversationStatus("PENDING")}><Icons.clock /></button>
          <button title="Close" onClick={() => void setConversationStatus("CLOSED")}><Icons.check /></button>
        </div>
      </header>
      <div className="messages">
        <div className="date-divider"><span>Today</span></div>
        {d.messages.map((message) => (
          <div key={message.id} className={message.direction === "OUTBOUND" ? "message outgoing" : "message incoming"}>
            <div className="bubble">
              {message.subject && d.channel === "GMAIL" && <strong className="message-subject">{message.subject}</strong>}
              <p>{message.text || "Unsupported message"}</p>
              <small>{formatTime(message.sentAt)} {message.direction === "OUTBOUND" && <span className="delivery">✓{message.deliveryStatus === "READ" ? "✓" : ""}</span>}</small>
            </div>
          </div>
        ))}
      </div>
      <div className="composer-wrap">
        {windowClosed && <div className="window-alert"><Icons.clock /><span>The WhatsApp 24-hour window is closed. Choose an approved template to continue.</span></div>}
        {notice && <div className={notice.includes("failed") || notice.includes("required") ? "error-notice" : "success-notice"}>{notice}</div>}
        <div className="composer">
          <textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder={windowClosed ? "Choose a template…" : `Reply via ${channelName(d.channel)}`} disabled={windowClosed} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }}} />
          <div className="composer-tools">
            <div><button>A</button><button><Icons.link /></button><button><Icons.smile /></button></div>
            <button className="send-button" disabled={sending || !reply.trim() || windowClosed} onClick={() => void send()}>{sending ? "Sending…" : "Send"}<Icons.send /></button>
          </div>
        </div>
      </div>
    </section>
  );
}

function CustomerPane({ detail }: { detail?: Detail }) {
  const contact = detail?.contact;
  const [note, setNote] = useState(""); const [notes, setNotes] = useState(contact?.notes ?? []);
  useEffect(() => setNotes(contact?.notes ?? []), [contact?.id, contact?.notes]);
  if (!contact) return <aside className="customer-pane" />;
  const c = contact;
  async function addNote() {
    if (!note.trim()) return;
    let created: (typeof notes)[number];
    try { created = await api<(typeof notes)[number]>(`/contacts/${c.id}/notes`, { method: "POST", body: JSON.stringify({ body: note }) }); }
    catch { created = { id: crypto.randomUUID(), body: note, createdAt: new Date().toISOString(), author: { name: "You" } }; }
    setNotes((current) => [created, ...current]); setNote("");
  }
  return (
    <aside className="customer-pane">
      <header><span>Customer details</span></header>
      <div className="customer-hero">
        <Avatar name={c.displayName} large />
        <h2>{c.displayName}</h2>
        <p>{c.primaryEmail ?? c.primaryPhone ?? "Cross-channel customer"}</p>
        <div className="quick-actions"><button title="Message"><Icons.message /><span>Message</span></button><button onClick={() => document.querySelector<HTMLInputElement>(".note-input input")?.focus()}><Icons.note /><span>Add note</span></button></div>
      </div>
      <DetailsSection title="Contact details">
        {c.identities.map((identity) => (<div className="detail-row" key={identity.id}><ChannelMark channel={identity.provider as Channel} /><span>{identity.address ?? identity.displayName ?? identity.externalId}</span></div>))}
      </DetailsSection>
      <DetailsSection title="Labels">
        <div className="profile-labels">{c.labels.map(({ label }) => <span key={label.id} style={{ "--label": label.color } as React.CSSProperties}>{label.name}</span>)}<button>+ Add</button></div>
      </DetailsSection>
      <DetailsSection title="Notes">
        <div className="note-input"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a private note…" /><button onClick={() => void addNote()}>Add</button></div>
        {notes.map((item) => <div className="note-card" key={item.id}><p>{item.body}</p><span>{item.author.name} · {relativeTime(item.createdAt)}</span></div>)}
      </DetailsSection>
    </aside>
  );
}

function DetailsSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return <section className="details-section"><button className="details-title" onClick={() => setOpen(!open)}><span>{title}</span><span>{open ? "−" : "+"}</span></button>{open && <div className="details-content">{children}</div>}</section>;
}
