"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";

export default function SignInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "sign-in") {
        await api("/auth/sign-in", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
      } else {
        await api("/auth/sign-up", {
          method: "POST",
          body: JSON.stringify({ email, password, name, tenantName, tenantSlug }),
        });
      }
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="sign-in-page">
      <div className="sign-in-card">
        <div className="sign-in-brand">
          <button className="brand" aria-label="Orbit home"><span>O</span></button>
          <strong>Orbit Inbox</strong>
        </div>
        <h1>{mode === "sign-in" ? "Sign in" : "Create your workspace"}</h1>
        <p className="sign-in-sub">One thoughtful place for every customer conversation.</p>
        {error && <div className="error-notice">{error}</div>}
        <form onSubmit={(e) => void handleSubmit(e)}>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required autoFocus />
          </label>
          {mode === "sign-up" && (
            <label>
              Your name
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ananya Rao" required />
            </label>
          )}
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "sign-up" ? "At least 6 characters" : "Your password"} required minLength={6} />
          </label>
          {mode === "sign-up" && (
            <>
              <label>
                Workspace name
                <input type="text" value={tenantName} onChange={(e) => setTenantName(e.target.value)} placeholder="My Company" />
              </label>
              <label>
                Workspace slug
                <input type="text" value={tenantSlug} onChange={(e) => setTenantSlug(e.target.value)} placeholder="my-company" />
              </label>
            </>
          )}
          <button className="primary sign-in-button" disabled={loading}>
            {loading ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Create workspace"}
          </button>
        </form>
        <p className="sign-in-toggle">
          {mode === "sign-in" ? (
            <>Don&apos;t have an account? <button onClick={() => setMode("sign-up")}>Create one</button></>
          ) : (
            <>Already have an account? <button onClick={() => setMode("sign-in")}>Sign in</button></>
          )}
        </p>
        {mode === "sign-in" && (
          <p className="sign-in-demo">
            Demo: <strong>sahil@example.com</strong> / <strong>orbit123</strong>
          </p>
        )}
      </div>
    </div>
  );
}
