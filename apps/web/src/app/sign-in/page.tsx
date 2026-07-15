"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";

const DEMO_EMAIL = "sahil@example.com";
const DEMO_PASSWORD = "orbit123";

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

  async function handleDemoSignIn() {
    setMode("sign-in");
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    setError("");
    setLoading(true);
    try {
      await api("/auth/sign-in", {
        method: "POST",
        body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD }),
      });
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo sign-in failed");
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
            {loading ? "Please wait..." : mode === "sign-in" ? "Sign in" : "Create workspace"}
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
          <div className="sign-in-demo">
            <span>Demo workspace</span>
            <strong>{DEMO_EMAIL}</strong>
            <button type="button" className="secondary sign-in-button demo-sign-in-button" onClick={() => void handleDemoSignIn()} disabled={loading}>
              Sign in as demo user
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
