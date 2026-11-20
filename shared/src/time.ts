import { USER_AGENT } from "./parse.js";

export interface TehranClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const TEHRAN_OFFSET_MS = 12_600_000;

const CLOCK_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Tehran",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23"
});

const TIME_IR_CREATED = /"created_date"\s*:\s*"(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})"/;
export const TIME_IR_URL = "https://www.time.ir/";

/** Tehran wall clock at a UTC instant (Iran has no daylight saving since 2022). */
export function tehranClock(epochMs: number): TehranClock {
  const parts = CLOCK_FORMATTER.formatToParts(new Date(epochMs));
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second")
  };
}

export function epochFromTehran(clock: TehranClock): number {
  return (
    Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second) -
    TEHRAN_OFFSET_MS
  );
}

/** Extracts the official Tehran clock that time.ir embeds in its HTML payload. */
export function parseTimeIrHtml(html: string): number | null {
  // The Next.js flight payload escapes quotes (`\"created_date\":\"...\"`).
  const m = html.replace(/\\+"/g, '"').match(TIME_IR_CREATED);
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m;
  const epoch = epochFromTehran({
    year: +y,
    month: +mo,
    day: +d,
    hour: +h,
    minute: +mi,
    second: +se
  });
  if (!Number.isFinite(epoch)) return null;
  if (epoch < Date.UTC(2010, 0, 1) || epoch > Date.UTC(2100, 0, 1)) return null;
  return epoch;
}

export async function fetchTimeIr(
  timeoutMs: number
): Promise<{ epochMs: number; tehran: TehranClock; via: "date-header" | "page-clock" }> {
  const started = Date.now();
  const res = await fetch(TIME_IR_URL, {
    headers: { accept: "text/html", "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store"
  });
  if (!res.ok) throw new Error(`time.ir HTTP ${res.status}`);
  const headerDate = res.headers.get("date");
  const html = await res.text();
  const now = Date.now();
  const headerEpoch = headerDate ? Date.parse(headerDate) : NaN;
  const pageEpoch = parseTimeIrHtml(html);

  // time.ir's own SSR clock can be cached for minutes; its Date header is live.
  if (Number.isFinite(headerEpoch) && Math.abs(headerEpoch - now) < 48 * 3600_000) {
    const epochMs = headerEpoch + Math.min((now - started) / 2, 1_500);
    return { epochMs, tehran: tehranClock(epochMs), via: "date-header" };
  }
  if (pageEpoch !== null && Math.abs(pageEpoch - now) < 48 * 3600_000) {
    return { epochMs: pageEpoch, tehran: tehranClock(pageEpoch), via: "page-clock" };
  }
  throw new Error("time.ir: clock not found");
}
