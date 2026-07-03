"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { previewDashboard, channelName, relativeTime, titleCase } from "@/lib/data";
import type { Channel, DashboardData } from "@/lib/types";
import { MetricCard, PanelTitle, Avatar, ChannelMark, PageHeader, Icons } from "./ui";

export function Dashboard({ onOpenInbox }: { onOpenInbox: () => void }) {
  const [data, setData] = useState<DashboardData>(previewDashboard);
  const [live, setLive] = useState(false);
  useEffect(() => { void api<DashboardData>("/dashboard").then((v) => { setData(v); setLive(true); }).catch(() => setLive(false)); }, []);
  const maxVolume = Math.max(...data.volume.flatMap((item) => [item.received, item.resolved]), 1);
  return (
    <section className="wide-page dashboard-page">
      <PageHeader eyebrow="Overview" title="Good morning" subtitle="Here is what needs your team's attention today." />
      <div className="dashboard-toolbar">
        <span className={live ? "data-state live" : "data-state"}><i />{live ? "Live workspace data" : "Preview workspace"}</span>
        <span>Last updated just now</span>
        <button className="primary" onClick={onOpenInbox}>Open inbox <Icons.chevron /></button>
      </div>
      <div className="metric-grid">
        <MetricCard label="Open conversations" value={data.metrics.open} detail={`${data.metrics.unassigned} unassigned`} tone="default" />
        <MetricCard label="SLA at risk" value={data.metrics.slaAtRisk} detail="Needs attention now" tone="danger" />
        <MetricCard label="First response" value={`${data.metrics.averageFirstResponseMinutes}m`} detail="7-day average" tone="good" />
        <MetricCard label="Resolved" value={data.metrics.resolved} detail="Last 7 days" tone="default" />
      </div>
      <div className="dashboard-grid">
        <article className="panel chart-panel">
          <PanelTitle title="Conversation volume" subtitle="Received and resolved over the last 7 days" action="Last 7 days" />
          <div className="bar-chart">
            {data.volume.map((item) => (
              <div className="bar-group" key={item.day}>
                <div className="bars">
                  <span className="bar received" style={{ height: `${Math.max(8, (item.received / maxVolume) * 100)}%` }} title={`${item.received} received`} />
                  <span className="bar resolved" style={{ height: `${Math.max(8, (item.resolved / maxVolume) * 100)}%` }} title={`${item.resolved} resolved`} />
                </div>
                <small>{item.day.replace(/^\w+ /, "")}</small>
              </div>
            ))}
          </div>
          <div className="chart-legend"><span><i className="received" />Received</span><span><i className="resolved" />Resolved</span></div>
        </article>
        <article className="panel attention-panel">
          <PanelTitle title="Needs attention" subtitle="Live operational queues" />
          <button onClick={onOpenInbox}><span className="attention-icon danger"><Icons.alert /></span><div><strong>{data.metrics.slaAtRisk} SLA risks</strong><p>Waiting beyond your response target</p></div><Icons.chevron /></button>
          <button onClick={onOpenInbox}><span className="attention-icon"><Icons.users /></span><div><strong>{data.metrics.unassigned} unassigned</strong><p>Ready for an available agent</p></div><Icons.chevron /></button>
          <button onClick={onOpenInbox}><span className="attention-icon waiting"><Icons.clock /></span><div><strong>{data.metrics.pending} waiting</strong><p>Pending customer follow-up</p></div><Icons.chevron /></button>
        </article>
        <article className="panel channel-panel">
          <PanelTitle title="Channel mix" subtitle="Where conversations arrive" />
          <div className="channel-breakdown">
            {data.channels.map((item) => (
              <div key={item.channel}>
                <span><ChannelMark channel={item.channel as Channel} />{channelName(item.channel as Channel)}</span>
                <div><i style={{ width: `${item.percentage}%` }} /></div>
                <strong>{item.percentage}%</strong>
              </div>
            ))}
          </div>
        </article>
        <article className="panel workload-panel">
          <PanelTitle title="Team workload" subtitle="Open work against agent capacity" action={`${data.agents.filter((item) => item.availability === "ONLINE").length} online`} />
          {data.agents.map((agent) => (
            <div className="workload-row" key={agent.userId}>
              <Avatar name={agent.name} />
              <div><strong>{agent.name}</strong><span><i className={`presence ${agent.availability.toLowerCase()}`} />{titleCase(agent.availability)}</span></div>
              <div className="capacity"><div><i style={{ width: `${Math.min(100, (agent.openConversations / agent.capacity) * 100)}%` }} /></div><span>{agent.openConversations}/{agent.capacity}</span></div>
            </div>
          ))}
        </article>
      </div>
      <article className="panel recent-panel">
        <PanelTitle title="Recent conversations" subtitle="Latest activity across every connected channel" />
        <div className="recent-head"><span>Customer</span><span>Conversation</span><span>Channel</span><span>Owner</span><span>Updated</span></div>
        {data.recent.map((item) => (
          <button className="recent-row" key={item.id} onClick={onOpenInbox}>
            <span><Avatar name={item.contact} /><strong>{item.contact}</strong></span>
            <p>{item.preview}</p>
            <span><ChannelMark channel={item.channel} />{channelName(item.channel)}</span>
            <span>{item.assignee ?? "Unassigned"}</span>
            <time>{relativeTime(item.lastMessageAt)}</time>
          </button>
        ))}
      </article>
    </section>
  );
}
