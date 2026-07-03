"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { previewAgents, titleCase } from "@/lib/data";
import type { Agent } from "@/lib/types";
import { Avatar, PageHeader, Icons } from "./ui";

export function Agents() {
  const [agents, setAgents] = useState<Agent[]>(previewAgents);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "AGENT" as "ADMIN" | "AGENT", capacity: 5 });
  const [notice, setNotice] = useState<string>(); const [preview, setPreview] = useState(true);
  useEffect(() => { void api<Agent[]>("/agents").then((v) => { setAgents(v); setPreview(false); }).catch(() => setPreview(true)); }, []);
  async function invite() {
    if (!form.name.trim() || !form.email.includes("@")) { setNotice("Enter a valid name and email."); return; }
    if (preview) { setAgents((c) => [...c, { userId: crypto.randomUUID(), ...form, status: "INVITED", availability: "OFFLINE", openConversations: 0, resolvedConversations: 0 }]); }
    else { await api("/agents", { method: "POST", body: JSON.stringify(form) }); setAgents(await api<Agent[]>("/agents")); }
    setInviteOpen(false); setForm({ name: "", email: "", role: "AGENT", capacity: 5 }); setNotice("Invitation created successfully.");
  }
  async function changeStatus(agent: Agent) {
    const status = agent.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
    if (!preview) await api(`/agents/${agent.userId}`, { method: "PATCH", body: JSON.stringify({ status }) });
    setAgents((c) => c.map((i) => i.userId === agent.userId ? { ...i, status } : i));
  }
  return (
    <section className="wide-page team-page">
      <PageHeader eyebrow="Workspace" title="Agents" subtitle="Invite teammates, control access, and balance active workloads." />
      <div className="team-toolbar"><div><strong>{agents.filter((a) => a.status === "ACTIVE").length} active agents</strong><span>{agents.filter((a) => a.availability === "ONLINE").length} currently online</span></div><button className="primary" onClick={() => setInviteOpen(true)}><Icons.plus />Invite agent</button></div>
      {notice && <div className="success-notice page-error">{notice}</div>}
      <article className="panel agents-table">
        <div className="agents-head"><span>Agent</span><span>Role</span><span>Status</span><span>Workload</span><span>Resolved</span><span /></div>
        {agents.map((agent) => <div className="agent-row" key={agent.userId}><span><Avatar name={agent.name} /><div><strong>{agent.name}</strong><small>{agent.email}</small></div></span><span className="role-pill">{titleCase(agent.role)}</span><span><i className={`presence ${agent.availability.toLowerCase()}`} />{agent.status === "INVITED" ? "Invite pending" : titleCase(agent.availability)}</span><span><div className="mini-capacity"><i style={{ width: `${Math.min(100, (agent.openConversations / agent.capacity) * 100)}%` }} /></div>{agent.openConversations}/{agent.capacity}</span><span>{agent.resolvedConversations}</span><button className="secondary" onClick={() => void changeStatus(agent)}>{agent.status === "SUSPENDED" ? "Restore" : "Suspend"}</button></div>)}
      </article>
      {inviteOpen && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.currentTarget === e.target) setInviteOpen(false); }}>
          <div className="modal-card">
            <header><div><h2>Invite an agent</h2><p>They will join this workspace with the access you choose.</p></div><button onClick={() => setInviteOpen(false)}><Icons.close /></button></header>
            <label>Full name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ananya Rao" /></label>
            <label>Work email<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="ananya@company.com" /></label>
            <div className="form-grid">
              <label>Role<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "ADMIN" | "AGENT" })}><option value="AGENT">Agent</option><option value="ADMIN">Administrator</option></select></label>
              <label>Capacity<input type="number" min="1" max="50" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} /></label>
            </div>
            <footer><button className="secondary" onClick={() => setInviteOpen(false)}>Cancel</button><button className="primary" onClick={() => void invite()}>Send invitation</button></footer>
          </div>
        </div>
      )}
    </section>
  );
}
