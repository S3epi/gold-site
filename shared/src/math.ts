import { Decimal } from "decimal.js";
import { MITHQAL_G, MITHQAL_PURITY, TROY_OUNCE_G } from "./instruments.js";

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

/** Pure gold price per gram in Toman, derived from the international ounce. */
export function pureGramToman(ounceUsd: number, usdToman: number): Decimal {
  return new Decimal(ounceUsd).mul(usdToman).div(TROY_OUNCE_G);
}

export function goldReferenceToman(ounceUsd: number, usdToman: number, purity: number): Decimal {
  return pureGramToman(ounceUsd, usdToman).mul(purity);
}

export function mithqalReferenceToman(ounceUsd: number, usdToman: number): Decimal {
  return pureGramToman(ounceUsd, usdToman).mul(MITHQAL_PURITY).mul(MITHQAL_G);
}

export function coinIntrinsicToman(
  ounceUsd: number,
  usdToman: number,
  spec: { weightG: number; purity: number }
): Decimal {
  return pureGramToman(ounceUsd, usdToman).mul(spec.weightG).mul(spec.purity);
}

export interface Bubble {
  intrinsicToman: number;
  bubbleToman: number;
  bubblePct: number;
}

export function bubbleOf(marketToman: number, intrinsicToman: Decimal): Bubble {
  const bubble = new Decimal(marketToman).minus(intrinsicToman);
  const pct = intrinsicToman.isZero() ? new Decimal(0) : bubble.div(intrinsicToman).mul(100);
  return {
    intrinsicToman: Math.round(intrinsicToman.toNumber()),
    bubbleToman: Math.round(bubble.toNumber()),
    bubblePct: round(pct.toNumber(), 2)
  };
}

export function pctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return new Decimal(current).minus(previous).div(previous).mul(100).toNumber();
}

/**
 * 24h change measured against a real recorded close. Returns nulls when the
 * baseline is missing or implausible, so nothing is invented.
 */
export function changeToClose(
  current: number | null,
  close: number | null
): { change: number | null; changePct: number | null } {
  if (
    current === null ||
    close === null ||
    !Number.isFinite(current) ||
    !Number.isFinite(close) ||
    current <= 0 ||
    close <= 0 ||
    close < current / 5 ||
    close > current * 5
  ) {
    return { change: null, changePct: null };
  }
  return {
    change: new Decimal(current).minus(close).toNumber(),
    changePct: round(pctChange(current, close) ?? 0, 2)
  };
}

export interface CloseRow {
  ts: number;
  close: number;
}

/**
 * Real close that anchors the 24h change: the newest close at or before the
 * 24h mark. When the displayed quote is itself that close (market closed and
 * no newer session recorded), the previous session's close carries the last
 * day's move instead of a meaningless 0.00%.
 */
export function baselineClose(
  closes: CloseRow[],
  target: number,
  current: number
): CloseRow | null {
  const rows = closes
    .filter((c) => Number.isFinite(c.ts) && Number.isFinite(c.close) && c.close > 0)
    .sort((a, b) => a.ts - b.ts);
  if (rows.length === 0) return null;
  let idx = -1;
  for (let i = 0; i < rows.length && rows[i].ts <= target; i += 1) idx = i;
  if (idx < 0) return null;
  const base = rows[idx];
  const quoteIsClose = Math.abs(current - base.close) < 0.01;
  if (base.ts === rows[rows.length - 1].ts && quoteIsClose && idx > 0) {
    return rows[idx - 1];
  }
  return base;
}

export function round(n: number, dp = 0): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

export function absDiffPct(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0 || b === 0) return 0;
  return (Math.abs(a - b) / ((a + b) / 2)) * 100;
}
