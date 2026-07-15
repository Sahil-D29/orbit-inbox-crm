import { api } from "./api";

export interface MeResponse {
  user: { id: string; email: string; name: string; avatarUrl?: string | null };
  tenants: { id: string; name: string; slug: string }[];
  currentTenant: { id: string; name: string; slug: string; role: "ADMIN" | "AGENT" } | null;
}

export async function getMe(): Promise<MeResponse | null> {
  try {
    return await api<MeResponse>("/auth/me");
  } catch {
    return null;
  }
}

let cachedMe: MeResponse | null = null;

export function setCachedMe(me: MeResponse | null) {
  cachedMe = me;
}

export function getCachedMe(): MeResponse | null {
  return cachedMe;
}
