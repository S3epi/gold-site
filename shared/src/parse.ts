const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const FA_DIGITS: Record<string, string> = {
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9"
};

export function normalizeDigits(input: string): string {
  return input.replace(/[۰-۹٠-٩]/g, (d) => FA_DIGITS[d] ?? d);
}

/** Parses numbers like "1,234,567", " 243,093,000 ", "<span>0.71%</span>", "۳۵۵۸" */
export function parseNumber(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (typeof input !== "string") return null;
  const clean = normalizeDigits(input)
    .replace(/<[^>]*>/g, "")
    .replace(/[,\s٬،]/g, "")
    .replace(/[^0-9.+-]/g, "");
  if (!clean || clean === "-" || clean === "." || clean === "+") return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

/** "2026-11-19 17:05:12" (Tehran, UTC+03:30) -> epoch ms */
export function parseTehranTs(input: unknown): number | null {
  if (typeof input !== "string") return null;
  const m = input.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m;
  const utc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(se ?? "0")) - 12_600_000;
  return Number.isFinite(utc) ? utc : null;
}

/** "2026/11/19" (TGJU daily history day) -> epoch ms at 12:00 Tehran */
export function parseDayTs(input: unknown): number | null {
  if (typeof input !== "string") return null;
  const m = input.trim().match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return Date.UTC(+y, +mo - 1, +d, 8, 30);
}

export function tehranDayKey(ts: number): string {
  return new Date(ts + 12_600_000).toISOString().slice(0, 10);
}

export function isValidPrice(
  price: number | null,
  bounds: { min: number; max: number }
): price is number {
  return price !== null && Number.isFinite(price) && price >= bounds.min && price <= bounds.max;
}

export function isValidTs(ts: number | null, now = Date.now()): ts is number {
  if (ts === null || !Number.isFinite(ts)) return false;
  return ts > Date.UTC(2000, 0, 1) && ts < now + 6 * 3600_000;
}

export async function fetchJson(
  url: string,
  timeoutMs: number,
  extraHeaders: Record<string, string> = {}
): Promise<unknown> {
  const res = await fetch(url, {
    headers: { accept: "application/json", ...extraHeaders },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${safeHost(url)}`);
  return res.json();
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "provider";
  }
}

export { UA as USER_AGENT };
