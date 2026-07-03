"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { WorkspaceSettings } from "@/lib/types";
import { PageHeader, Icons } from "./ui";
import { Channels } from "./channels";

export function WorkspaceSettings() {
  const [tab, setTab] = useState<"general" | "inbox" | "channels" | "security">("general");
  const [settings, setSettings] = useState<WorkspaceSettings>({
    name: "My Workspace", timezone: "UTC", retentionDays: 365,
    firstResponseSlaMinutes: 60, resolutionSlaMinutes: 1440,
    assignmentMode: "BALANCED", businessHours: { days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" },
  });
  const [notice, setNotice] = useState<string>(); const [preview, setPreview] = useState(true);
  useEffect(() => { void api<WorkspaceSettings>("/workspace-settings").then((v) => { setSettings(v); setPreview(false); }).catch(() => setPreview(true)); }, []);
  async function save() { if (!preview) await api("/workspace-settings", { method: "PATCH", body: JSON.stringify(settings) }); setNotice("Workspace settings saved."); }
  function setBusiness(key: "days" | "start" | "end", value: unknown) { setSettings({ ...settings, businessHours: { ...settings.businessHours, [key]: value } }); }
  return (
    <section className="wide-page settings-shell">
      <PageHeader eyebrow="Administration" title="Settings" subtitle="Configure your workspace, inbox behavior, channels, and security." />
      <div className="settings-layout">
        <aside className="settings-nav">
          {[["general", "General"], ["inbox", "Inbox & SLA"], ["channels", "Channels"], ["security", "Security & data"]].map(([id, label]) => (
            <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id as typeof tab)}>{label}<Icons.chevron /></button>
          ))}
        </aside>
        <div className="settings-content">
          {notice && <div className="success-notice">{notice}</div>}
          {tab === "general" && (
            <SettingsCard title="Workspace details" subtitle="Basic information used throughout your CRM">
              <label>Workspace name<input value={settings.name} onChange={(e) => setSettings({ ...settings, name: e.target.value })} /></label>
              <label>Timezone<select value={settings.timezone} onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}>
                <option value="Asia/Calcutta">India Standard Time</option>
                <option value="UTC">UTC</option><option value="America/New_York">Eastern Time</option><option value="Europe/London">London</option>
              </select></label>
              <div className="settings-footer"><button className="primary" onClick={() => void save()}>Save changes</button></div>
            </SettingsCard>
          )}
          {tab === "inbox" && (
            <>
              <SettingsCard title="Assignment" subtitle="Control how new conversations are distributed">
                <label>Assignment method<select value={settings.assignmentMode} onChange={(e) => setSettings({ ...settings, assignmentMode: e.target.value })}>
                  <option value="MANUAL">Manual assignment</option><option value="BALANCED">Balanced workload</option><option value="ROUND_ROBIN">Round robin</option>
                </select><small>Balanced assignment sends work to the available agent with the lowest workload.</small></label>
              </SettingsCard>
              <SettingsCard title="Service levels" subtitle="Highlight conversations before customers wait too long">
                <div className="form-grid">
                  <label>First response target<input type="number" value={settings.firstResponseSlaMinutes} onChange={(e) => setSettings({ ...settings, firstResponseSlaMinutes: Number(e.target.value) })} /><small>Minutes</small></label>
                  <label>Resolution target<input type="number" value={settings.resolutionSlaMinutes} onChange={(e) => setSettings({ ...settings, resolutionSlaMinutes: Number(e.target.value) })} /><small>Minutes</small></label>
                </div>
              </SettingsCard>
              <SettingsCard title="Business hours" subtitle="Measure SLA time only while your team is available">
                <div className="form-grid">
                  <label>Opening time<input type="time" value={settings.businessHours.start} onChange={(e) => setBusiness("start", e.target.value)} /></label>
                  <label>Closing time<input type="time" value={settings.businessHours.end} onChange={(e) => setBusiness("end", e.target.value)} /></label>
                </div>
                <div className="day-picker">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, i) => (
                    <button key={day} className={settings.businessHours.days.includes(i + 1) ? "active" : ""} onClick={() => setBusiness("days", settings.businessHours.days.includes(i + 1) ? settings.businessHours.days.filter((d) => d !== i + 1) : [...settings.businessHours.days, i + 1])}>{day}</button>
                  ))}
                </div>
                <div className="settings-footer"><button className="primary" onClick={() => void save()}>Save SLA</button></div>
              </SettingsCard>
            </>
          )}
          {tab === "channels" && <Channels embedded />}
          {tab === "security" && (
            <>
              <SettingsCard title="Data retention" subtitle="Choose how long conversation data remains available">
                <label>Retention period<select value={settings.retentionDays} onChange={(e) => setSettings({ ...settings, retentionDays: Number(e.target.value) })}>
                  <option value="90">90 days</option><option value="365">1 year</option><option value="730">2 years</option><option value="3650">10 years</option>
                </select></label>
                <div className="settings-footer"><button className="primary" onClick={() => void save()}>Save retention</button></div>
              </SettingsCard>
              <SettingsCard title="Security controls" subtitle="Protection enabled for every workspace">
                <div className="security-list">
                  <span><Icons.check />Tenant-isolated records</span>
                  <span><Icons.check />Encrypted provider tokens</span>
                  <span><Icons.check />Signed webhook verification</span>
                  <span><Icons.check />Administrative audit log</span>
                </div>
              </SettingsCard>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function SettingsCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <article className="panel settings-card"><header><h3>{title}</h3><p>{subtitle}</p></header><div>{children}</div></article>;
}
