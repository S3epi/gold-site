import type { Period } from "./types.js";

export const PERIODS: Period[] = ["today", "24h", "1w", "1m", "3m", "6m", "1y", "all"];

const DAY = 86_400_000;
const TEHRAN_OFFSET_MS = 12_600_000;

export const PERIOD_MS: Record<Exclude<Period, "all" | "today">, number> = {
  "24h": DAY,
  "1w": 7 * DAY,
  "1m": 30 * DAY,
  "3m": 90 * DAY,
  "6m": 180 * DAY,
  "1y": 365 * DAY
};

export const PERIOD_LABELS: Record<Period, string> = {
  today: "امروز",
  "24h": "۲۴ ساعت",
  "1w": "۱ هفته",
  "1m": "۱ ماه",
  "3m": "۳ ماه",
  "6m": "۶ ماه",
  "1y": "۱ سال",
  all: "همه"
};

/** Start of the current Tehran day (Iran has no daylight saving since 2022). */
export function tehranDayStart(now = Date.now()): number {
  return Math.floor((now + TEHRAN_OFFSET_MS) / DAY) * DAY - TEHRAN_OFFSET_MS;
}

export function periodStart(period: Period, now = Date.now()): number {
  if (period === "all") return 0;
  if (period === "today") return tehranDayStart(now);
  return now - PERIOD_MS[period];
}

export function isPeriod(value: unknown): value is Period {
  return typeof value === "string" && (PERIODS as string[]).includes(value);
}
