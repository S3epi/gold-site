const BASE = import.meta.env.BASE_URL;

export const API_BASE = `${BASE}api`;

export function apiUrl(path: string): string {
  return `${API_BASE}/${path.replace(/^\/+/, "")}`;
}

export async function apiJson<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = 15_000
): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    credentials: "same-origin",
    headers: { accept: "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(timeoutMs)
  });
  const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  return json as T;
}

export async function apiPost<T>(path: string, body: unknown, timeoutMs = 20_000): Promise<T> {
  return apiJson<T>(
    path,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    },
    timeoutMs
  );
}

export function deviceId(): string {
  const key = "narkhino.device.v1";
  try {
    const existing = localStorage.getItem(key);
    if (existing && existing.length >= 8) return existing;
    const next =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `d${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(key, next);
    return next;
  } catch {
    return `d${Date.now().toString(36)}`;
  }
}
