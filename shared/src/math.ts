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

export function round(n: number, dp = 0): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

export function absDiffPct(a: number, b: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0 || b === 0) return 0;
  return (Math.abs(a - b) / ((a + b) / 2)) * 100;
}
