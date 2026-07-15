const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}/v1${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function setDevHeaders(tenantId: string, userId: string) {
  const origFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("x-tenant-id", tenantId);
    headers.set("x-user-id", userId);
    return origFetch(input, { ...init, headers });
  };
}
