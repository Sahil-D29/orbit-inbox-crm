import type { Channel } from "@/lib/types";
import { initials } from "@/lib/data";
import { Icons } from "./icons";

export { Icons, initials };

export function Avatar({ name, image, online, large }: { name: string; image?: string; online?: boolean; large?: boolean }) {
  return <div className={`avatar ${large ? "avatar-large" : ""}`} style={image ? { backgroundImage: `url(${image})` } : undefined}><span>{image ? "" : initials(name)}</span>{online && <i />}</div>;
}

export function ChannelMark({ channel }: { channel: Channel }) {
  const map: Record<Channel, { letter: string; className: string }> = {
    GMAIL: { letter: "M", className: "gmail" }, WHATSAPP: { letter: "W", className: "whatsapp" },
    INSTAGRAM_DM: { letter: "I", className: "instagram" }, FACEBOOK_MESSENGER: { letter: "F", className: "facebook" },
  };
  const value = map[channel] ?? { letter: "•", className: "other" };
  return <span className={`channel-mark ${value.className}`}>{value.letter}</span>;
}

export function MetricCard({ label, value, detail, tone }: { label: string; value: string | number; detail: string; tone: "default" | "danger" | "good" }) {
  return (
    <article className={`metric-card panel ${tone}`}>
      <div><span>{label}</span>{tone === "danger" ? <Icons.alert /> : <Icons.trend />}</div>
      <strong>{value}</strong><p>{detail}</p>
    </article>
  );
}

export function PanelTitle({ title, subtitle, action }: { title: string; subtitle: string; action?: string }) {
  return <header className="panel-title"><div><h3>{title}</h3><p>{subtitle}</p></div>{action && <span>{action}</span>}</header>;
}

export function PageHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return <header className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></div><div className="avatar">O</div></header>;
}
