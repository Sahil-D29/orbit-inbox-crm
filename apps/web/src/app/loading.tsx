export default function Loading() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: "12px", color: "#64748b", fontSize: "14px" }}>
      <div className="spinner" style={{ width: "24px", height: "24px", border: "2px solid #e2e8f0", borderTopColor: "#4f46e5", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
      Loading Orbit…
    </div>
  );
}
