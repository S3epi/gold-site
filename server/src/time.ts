import { fetchTimeIr, tehranClock, type AppTimePayload } from "@mesghalyar/shared";

const CACHE_MS = 60_000;
let cached: { at: number; payload: AppTimePayload } | null = null;
let inFlight: Promise<AppTimePayload> | null = null;

async function sample(): Promise<AppTimePayload> {
  const sampledAt = Date.now();
  try {
    const timeIr = await fetchTimeIr(8_000);
    return {
      ok: true,
      source: "time.ir",
      offsetMs: timeIr.epochMs - sampledAt,
      epochMs: timeIr.epochMs,
      sampledAt,
      tehran: timeIr.tehran,
      generatedAt: Date.now()
    };
  } catch {
    return {
      ok: true,
      source: "host",
      offsetMs: 0,
      epochMs: sampledAt,
      sampledAt,
      tehran: tehranClock(sampledAt),
      generatedAt: Date.now()
    };
  }
}

/** Clock reference served to the browser: time.ir corrected against this host clock. */
export async function referenceTime(): Promise<AppTimePayload> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.payload;
  if (inFlight) return inFlight;
  inFlight = sample()
    .then((payload) => {
      cached = { at: Date.now(), payload };
      return payload;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
