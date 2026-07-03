import type { Metadata, Viewport } from "next";
import "./globals.css";

const title = "Orbit Inbox — Unified Customer Conversations";
const description = "One thoughtful place for every customer conversation. Manage Gmail, WhatsApp, Instagram, and Facebook Messenger from a single inbox.";

export const metadata: Metadata = {
  title: { default: title, template: "%s | Orbit Inbox" },
  description,
  keywords: ["CRM", "customer inbox", "unified inbox", "multi-channel", "customer support", "WhatsApp", "Gmail", "Instagram", "Messenger"],
  authors: [{ name: "Orbit CRM" }],
  creator: "Orbit CRM",
  metadataBase: new URL(process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000"),
  openGraph: {
    title, description,
    url: "/", siteName: "Orbit Inbox",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Orbit Inbox" }],
    locale: "en_US", type: "website",
  },
  twitter: {
    card: "summary_large_image", title, description, images: ["/og.png"],
  },
  robots: { index: true, follow: true },
  icons: { icon: "/favicon.svg", apple: "/apple-touch-icon.png" },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;650;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
