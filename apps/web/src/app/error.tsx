"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: "16px", padding: "24px", textAlign: "center" }}>
      <h1 style={{ fontSize: "24px", fontWeight: 700, margin: 0 }}>Something went wrong</h1>
      <p style={{ color: "#64748b", fontSize: "14px", maxWidth: "400px" }}>{error.message || "Unexpected error loading Orbit Inbox."}</p>
      <button onClick={reset} style={{ padding: "10px 20px", background: "#4f46e5", color: "white", border: 0, borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}>Try again</button>
    </div>
  );
}
