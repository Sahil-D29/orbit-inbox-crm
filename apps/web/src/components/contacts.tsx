"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Channel } from "@/lib/types";
import { Avatar, ChannelMark, PageHeader, Icons } from "./ui";

export function Contacts() {
  const [contacts, setContacts] = useState<{ id: string; displayName: string; primaryEmail?: string; primaryPhone?: string; identities: { provider: string }[] }[]>([]);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => void api<typeof contacts>(`/contacts?q=${encodeURIComponent(query)}`).then(setContacts).catch(() => {
      const preview = [
        { id: "aarav", displayName: "Aarav Mehta", primaryPhone: "+91 98100 01001", identities: [{ provider: "WHATSAPP" }] },
        { id: "maya", displayName: "Maya Kapoor", primaryEmail: "maya@example.com", identities: [{ provider: "GMAIL" }, { provider: "INSTAGRAM_DM" }] },
        { id: "riya", displayName: "Riya Sharma", identities: [{ provider: "INSTAGRAM_DM" }] },
        { id: "kabir", displayName: "Kabir Singh", identities: [{ provider: "FACEBOOK_MESSENGER" }] },
      ];
      setContacts(preview.filter((contact) => contact.displayName.toLowerCase().includes(query.toLowerCase())));
    }), 150);
    return () => clearTimeout(timer);
  }, [query]);
  return (
    <section className="wide-page">
      <PageHeader eyebrow="People" title="Contacts" subtitle="Every identity and conversation, gathered into one careful record." />
      <div className="contacts-panel panel">
        <div className="panel-toolbar"><div className="search-box"><Icons.search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email, or phone" /></div><span className="table-count">{contacts.length} customers</span></div>
        <div className="table-head"><span>Customer</span><span>Channels</span><span>Contact</span><span>Updated</span></div>
        {contacts.map((contact) => <div className="contact-table-row" key={contact.id}><div><Avatar name={contact.displayName} /><strong>{contact.displayName}</strong></div><div className="channel-stack">{contact.identities.map((identity, i) => <ChannelMark channel={identity.provider as Channel} key={i} />)}</div><span>{contact.primaryEmail ?? contact.primaryPhone ?? "—"}</span><span>Recently</span></div>)}
        {contacts.length === 0 && <div className="empty-state"><Icons.users /><strong>No contacts found</strong><span>Seed the demo or connect a channel.</span></div>}
      </div>
    </section>
  );
}
