const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const TENANT_ID =
  process.env.NEXT_PUBLIC_DEV_TENANT_ID ?? "11111111-1111-4111-8111-111111111111";
const USER_ID =
  process.env.NEXT_PUBLIC_DEV_USER_ID ?? "22222222-2222-4222-8222-222222222222";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}/v1${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-tenant-id": TENANT_ID,
      "x-user-id": USER_ID,
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}
