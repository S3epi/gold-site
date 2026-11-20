import type { Period } from "./types.js";

export const PERIODS: Period[] = ["24h", "1w", "1m", "3m", "6m", "1y", "all"];

const DAY = 86_400_000;

export const PERIOD_MS: Record<Exclude<Period, "all">, number> = {
  "24h": DAY,
  "1w": 7 * DAY,
  "1m": 30 * DAY,
  "3m": 90 * DAY,
  "6m": 180 * DAY,
  "1y": 365 * DAY
};

export const PERIOD_LABELS: Record<Period, string> = {
  "24h": "۲۴ ساعت",
  "1w": "۱ هفته",
  "1m": "۱ ماه",
  "3m": "۳ ماه",
  "6m": "۶ ماه",
  "1y": "۱ سال",
  all: "همه"
};

export function periodStart(period: Period, now = Date.now()): number {
  return period === "all" ? 0 : now - PERIOD_MS[period];
}

export function isPeriod(value: unknown): value is Period {
  return typeof value === "string" && (PERIODS as string[]).includes(value);
}
