import type { AppTimePayload } from "@mesghalyar/shared";

const BASE = import.meta.env.BASE_URL;
const CACHE_MS = 60_000;
const SYNC_MS = 5 * 60_000;

let anchorEpoch: number | null = null;
let anchorMono = 0;
let lastSyncMono = Number.NEGATIVE_INFINITY;
let inFlight: Promise<void> | null = null;

/**
 * Authoritative "now": the time.ir clock published by the site (or the server
 * endpoint), anchored to a monotonic timer. The visitor device clock is only a
 * last resort when no reference is reachable at all.
 */
export function referenceNow(): number {
  if (anchorEpoch === null) return Date.now();
  return anchorEpoch + (performance.now() - anchorMono);
}

export function referenceIsSynced(): boolean {
  return anchorEpoch !== null;
}

async function loadPayload(): Promise<{ dateHeader: string | null; payload: AppTimePayload } | null> {
  for (const path of ["api/v1/time", "api/v1/app-time.json"]) {
    try {
      const res = await fetch(`${BASE}${path}`, {
        cache: "no-store",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(10_000)
      });
      if (!res.ok) continue;
      const payload = (await res.json()) as AppTimePayload | null;
      if (!payload || typeof payload.offsetMs !== "number" || !Number.isFinite(payload.offsetMs)) {
        continue;
      }
      return { dateHeader: res.headers.get("date"), payload };
    } catch {
      // try the next source
    }
  }
  return null;
}

export async function syncReferenceTime(force = false): Promise<void> {
  const startedMono = performance.now();
  if (inFlight) return inFlight;
  if (!force && anchorEpoch !== null && startedMono - lastSyncMono < CACHE_MS) return;
  lastSyncMono = startedMono;

  inFlight = (async () => {
    const found = await loadPayload();
    const rtt = performance.now() - startedMono;
    if (!found) return;
    const hostEpoch = found.dateHeader ? Date.parse(found.dateHeader) : NaN;
    const payload = found.payload;
    const latency = Math.min(rtt / 2, 1_500);
    const epoch = Number.isFinite(hostEpoch)
      ? hostEpoch + payload.offsetMs + latency
      : typeof payload.epochMs === "number"
        ? Date.now() + payload.offsetMs + latency
        : null;
    if (epoch === null) return;
    anchorEpoch = epoch;
    anchorMono = performance.now();
    lastSyncMono = anchorMono;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

export const CLOCK_SYNC_MS = SYNC_MS;
