import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>;
}

export const Icons = {
  dashboard: (props: IconProps) => <Icon {...props}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="4" rx="1" /><rect x="14" y="11" width="7" height="10" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></Icon>,
  inbox: (props: IconProps) => <Icon {...props}><path d="M4 4h16v16H4z" /><path d="M4 14h4l2 3h4l2-3h4" /></Icon>,
  message: (props: IconProps) => <Icon {...props}><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /></Icon>,
  users: (props: IconProps) => <Icon {...props}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></Icon>,
  chart: (props: IconProps) => <Icon {...props}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></Icon>,
  settings: (props: IconProps) => <Icon {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.1A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3V9.6h.1A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.4.3.6.7.6 1.1v.1H21v4h-.1a1.7 1.7 0 0 0-1.5.8z" /></Icon>,
  plus: (props: IconProps) => <Icon {...props}><path d="M12 5v14M5 12h14" /></Icon>,
  trend: (props: IconProps) => <Icon {...props}><path d="m3 17 6-6 4 4 8-9" /><path d="M15 6h6v6" /></Icon>,
  alert: (props: IconProps) => <Icon {...props}><path d="M12 3 2.5 20h19z" /><path d="M12 9v4M12 17h.01" /></Icon>,
  search: (props: IconProps) => <Icon {...props}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></Icon>,
  filter: (props: IconProps) => <Icon {...props}><path d="M4 5h16M7 12h10M10 19h4" /></Icon>,
  check: (props: IconProps) => <Icon {...props}><path d="m5 12 4 4L19 6" /></Icon>,
  clock: (props: IconProps) => <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>,
  close: (props: IconProps) => <Icon {...props}><path d="m6 6 12 12M18 6 6 18" /></Icon>,
  send: (props: IconProps) => <Icon {...props}><path d="m22 2-7 20-4-9-9-4zM22 2 11 13" /></Icon>,
  tag: (props: IconProps) => <Icon {...props}><path d="M20 13 13 20 4 11V4h7z" /><circle cx="8.5" cy="8.5" r="1" /></Icon>,
  note: (props: IconProps) => <Icon {...props}><path d="M4 3h16v18H4zM8 8h8M8 12h8M8 16h5" /></Icon>,
  chevron: (props: IconProps) => <Icon {...props}><path d="m9 18 6-6-6-6" /></Icon>,
  more: (props: IconProps) => <Icon {...props}><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" /></Icon>,
  link: (props: IconProps) => <Icon {...props}><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" /></Icon>,
  bolt: (props: IconProps) => <Icon {...props}><path d="m13 2-9 12h8l-1 8 9-12h-8z" /></Icon>,
  eyeOff: (props: IconProps) => <Icon {...props}><path d="m3 3 18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 4.2A10.5 10.5 0 0 1 12 4c5 0 9 5 9 8a8.6 8.6 0 0 1-1.8 3.4M6.6 6.6C4.4 8.1 3 10.5 3 12c0 3 4 8 9 8a9.5 9.5 0 0 0 3-.5" /></Icon>,
  smile: (props: IconProps) => <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></Icon>,
};
