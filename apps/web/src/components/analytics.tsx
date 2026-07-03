"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { previewAnalytics, channelName, exportAnalyticsCsv } from "@/lib/data";
import type { AnalyticsData, Channel } from "@/lib/types";
import { MetricCard, PanelTitle, PageHeader, Avatar, ChannelMark } from "./ui";

export function Analytics() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AnalyticsData>(() => previewAnalytics(30));
  useEffect(() => { void api<AnalyticsData>(`/analytics?days=${days}`).then(setData).catch(() => setData(previewAnalytics(days))); }, [days]);
  const maxTrend = Math.max(...data.trend.map((item) => item.conversations), 1);
  return (
    <section className="wide-page analytics-page">
      <PageHeader eyebrow="Reports" title="Analytics" subtitle="Understand volume, responsiveness, and team performance." />
      <div className="report-controls">
        <div className="segmented">{[7, 30, 90].map((v) => <button key={v} className={days === v ? "active" : ""} onClick={() => setDays(v)}>{v} days</button>)}</div>
        <button className="secondary" onClick={() => exportAnalyticsCsv(data)}>Export CSV</button>
      </div>
      <div className="metric-grid">
        <MetricCard label="Conversations" value={data.metrics.conversations} detail={`Last ${data.periodDays} days`} tone="default" />
        <MetricCard label="Resolution rate" value={`${data.metrics.resolutionRate}%`} detail={`${data.metrics.resolved} resolved`} tone="good" />
        <MetricCard label="First response" value={`${data.metrics.averageFirstResponseMinutes}m`} detail="Average response time" tone="good" />
        <MetricCard label="Replies sent" value={data.metrics.replies} detail="Agent messages" tone="default" />
      </div>
      <div className="analytics-grid">
        <article className="panel trend-panel">
          <PanelTitle title="Conversation trend" subtitle="New volume compared with resolved conversations" />
          <div className="line-bars">
            {data.trend.map((item) => <div key={item.label}><span style={{ height: `${Math.max(5, (item.conversations / maxTrend) * 100)}%` }} /><i style={{ height: `${Math.max(4, (item.resolved / maxTrend) * 100)}%` }} /><small>{item.label}</small></div>)}
          </div>
        </article>
        <article className="panel channel-performance">
          <PanelTitle title="Channel performance" subtitle="Share of total conversations" />
          {data.channels.map((item) => <div key={item.channel}><ChannelMark channel={item.channel as Channel} /><span>{channelName(item.channel as Channel)}</span><div><i style={{ width: `${item.percentage}%` }} /></div><strong>{item.count}</strong></div>)}
        </article>
      </div>
      <article className="panel agent-performance">
        <PanelTitle title="Agent performance" subtitle="Work handled during the selected period" />
        <div className="performance-head"><span>Agent</span><span>Assigned</span><span>Resolved</span><span>Replies</span><span>Resolution</span></div>
        {data.agents.map((agent) => <div className="performance-row" key={agent.id}><span><Avatar name={agent.name} /><strong>{agent.name}</strong></span><span>{agent.assigned}</span><span>{agent.resolved}</span><span>{agent.replies}</span><span><b>{agent.assigned ? Math.round((agent.resolved / agent.assigned) * 100) : 0}%</b></span></div>)}
      </article>
    </section>
  );
}
