import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Orbit Inbox",
    short_name: "Orbit",
    description: "One thoughtful place for every customer conversation",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#4f46e5",
    icons: [
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
