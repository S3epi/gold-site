import { INSTRUMENTS, INSTRUMENT_BY_ID, type Instrument } from "./instruments.js";
import {
  bubbleOf,
  coinIntrinsicToman,
  goldReferenceToman,
  mithqalReferenceToman,
  pureGramToman,
  round
} from "./math.js";
import type {
  CalcBasis,
  CalculationsPayload,
  ChartPoint,
  ItemCalc,
  LiveEntry,
  MarketStatus,
  PriceItem,
  Quality
} from "./types.js";

export const CALC_DISCLAIMER =
  "ارزش مرجع/حباب، محاسبهٔ نظری بر پایه انس جهانی و نرخ دلار است و قیمت معامله نیست.";

export function toDisplayPrice(inst: Instrument, price: number): number {
  return inst.unit === "IRR" ? round(price / 10) : round(price, 2);
}

export function statusOf(ts: number | null, now: number, q: Quality): MarketStatus {
  if (ts === null || !Number.isFinite(ts)) return "UNAVAILABLE";
  const age = now - ts;
  if (age <= q.liveWithinMs) return "LIVE";
  if (age > q.staleAfterMs) return "STALE";
  return "DELAYED";
}

export interface BuildOptions {
  disputed?: Set<string>;
  /** Values that could not be confirmed by at least two independent sources. */
  unverified?: Set<string>;
  forcedStatus?: Record<string, MarketStatus>;
  mode?: "server" | "static";
}

function convertMaybe(inst: Instrument, value: number | null | undefined, dp = 0): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return inst.unit === "IRR" ? round(value / 10, dp) : round(value, 2);
}

export function buildPriceItems(
  entries: Map<string, LiveEntry | null>,
  now: number,
  quality: Quality,
  opts: BuildOptions = {}
): PriceItem[] {
  const items: PriceItem[] = INSTRUMENTS.map((inst) => {
    const entry = entries.get(inst.id) ?? null;
    let status: MarketStatus = entry ? statusOf(entry.ts, now, quality) : "UNAVAILABLE";
    if (entry && opts.forcedStatus?.[inst.id]) status = opts.forcedStatus[inst.id];
    if (entry && opts.disputed?.has(inst.id)) status = "DISPUTED";
    if (entry && opts.unverified?.has(inst.id) && status !== "DISPUTED" && status !== "STALE") {
      status = "UNVERIFIED";
    }

    return {
      id: inst.id,
      title: inst.title,
      short: inst.short,
      category: inst.category,
      unit: inst.unit === "IRR" ? "TOMAN" : "USD",
      price: entry ? toDisplayPrice(inst, entry.price) : null,
      change: convertMaybe(inst, entry?.change ?? null),
      changePct: entry?.changePct ?? null,
      high: convertMaybe(inst, entry?.high ?? null),
      low: convertMaybe(inst, entry?.low ?? null),
      ts: entry?.ts ?? null,
      source: entry?.source ?? null,
      status,
      ...(inst.spec ? { spec: inst.spec } : {}),
      ...(inst.note ? { note: inst.note } : {})
    };
  });

  const usdItem = items.find((i) => i.id === "usd") ?? null;
  const ounceItem = items.find((i) => i.id === "xau") ?? null;
  const basis = makeBasis(usdItem, ounceItem);

  if (basis) {
    for (const item of items) {
      const inst = INSTRUMENT_BY_ID.get(item.id);
      if (!inst || item.price === null) continue;
      item.calc = buildItemCalc(inst, item.price, basis);
    }
  }
  return items;
}

function makeBasis(usd: PriceItem | null, ounce: PriceItem | null): CalcBasis | null {
  if (!usd || !ounce || usd.price === null || ounce.price === null) return null;
  if (usd.status === "UNAVAILABLE" || ounce.status === "UNAVAILABLE") return null;
  return {
    ounceUsd: ounce.price,
    usdToman: usd.price,
    ounceTs: ounce.ts,
    usdTs: usd.ts
  };
}

function buildItemCalc(inst: Instrument, marketPrice: number, basis: CalcBasis): ItemCalc | null {
  if (inst.reference?.kind === "gold") {
    const reference = goldReferenceToman(basis.ounceUsd, basis.usdToman, inst.reference.purity);
    const referenceToman = Math.round(reference.toNumber());
    const premium = marketPrice - referenceToman;
    return {
      kind: "platform-reference",
      referenceToman,
      premiumToman: Math.round(premium),
      premiumPct: round((premium / referenceToman) * 100, 2),
      basis,
      disclaimer: CALC_DISCLAIMER
    };
  }
  if (inst.reference?.kind === "mithqal") {
    const reference = mithqalReferenceToman(basis.ounceUsd, basis.usdToman);
    const referenceToman = Math.round(reference.toNumber());
    const premium = marketPrice - referenceToman;
    return {
      kind: "platform-reference",
      referenceToman,
      premiumToman: Math.round(premium),
      premiumPct: round((premium / referenceToman) * 100, 2),
      basis,
      disclaimer: CALC_DISCLAIMER
    };
  }
  if (inst.spec) {
    const intrinsic = coinIntrinsicToman(basis.ounceUsd, basis.usdToman, inst.spec);
    const bubble = bubbleOf(marketPrice, intrinsic);
    return {
      kind: "theoretical-bubble",
      intrinsicToman: bubble.intrinsicToman,
      bubbleToman: bubble.bubbleToman,
      bubblePct: bubble.bubblePct,
      basis,
      disclaimer: CALC_DISCLAIMER
    };
  }
  return null;
}

export function computeCalculations(items: PriceItem[]): CalculationsPayload {
  const usd = items.find((i) => i.id === "usd") ?? null;
  const ounce = items.find((i) => i.id === "xau") ?? null;
  const basis = makeBasis(usd, ounce);

  if (!basis) {
    return {
      usdToman: usd?.price ?? null,
      ounceUsd: ounce?.price ?? null,
      pureGramToman: null,
      gold18ReferenceToman: null,
      gold24ReferenceToman: null,
      gold740ReferenceToman: null,
      mithqalReferenceToman: null,
      coins: [],
      basis: null,
      disclaimer: CALC_DISCLAIMER
    };
  }

  const pure = pureGramToman(basis.ounceUsd, basis.usdToman);
  const coins = items
    .filter((i) => i.category === "coin" && i.price !== null && i.calc?.kind === "theoretical-bubble")
    .map((i) => ({
      id: i.id,
      title: i.title,
      marketToman: i.price as number,
      intrinsicToman: i.calc?.intrinsicToman ?? 0,
      bubbleToman: i.calc?.bubbleToman ?? 0,
      bubblePct: i.calc?.bubblePct ?? 0
    }));

  return {
    usdToman: basis.usdToman,
    ounceUsd: basis.ounceUsd,
    pureGramToman: Math.round(pure.toNumber()),
    gold18ReferenceToman: Math.round(goldReferenceToman(basis.ounceUsd, basis.usdToman, 0.75).toNumber()),
    gold24ReferenceToman: Math.round(goldReferenceToman(basis.ounceUsd, basis.usdToman, 0.999).toNumber()),
    gold740ReferenceToman: Math.round(goldReferenceToman(basis.ounceUsd, basis.usdToman, 0.74).toNumber()),
    mithqalReferenceToman: Math.round(mithqalReferenceToman(basis.ounceUsd, basis.usdToman).toNumber()),
    coins,
    basis,
    disclaimer: CALC_DISCLAIMER
  };
}

/**
 * Reduces points to at most `maxPoints` by keeping the last real observation
 * of each time bucket. No synthetic/interpolated values are produced.
 * The result has one point per second: chart libraries reject duplicate times.
 */
export function aggregateChartPoints(
  points: { ts: number; price: number }[],
  maxPoints = 900
): ChartPoint[] {
  const sorted = points
    .filter((p) => Number.isFinite(p.ts) && Number.isFinite(p.price) && p.price > 0)
    .sort((a, b) => a.ts - b.ts);

  if (sorted.length <= maxPoints) {
    return compactSeconds(
      sorted.map((p) => ({ t: Math.floor(p.ts / 1000), p: round(p.price, 2) }))
    );
  }

  const from = sorted[0].ts;
  const to = sorted[sorted.length - 1].ts;
  const bucketMs = Math.max(1, Math.ceil((to - from) / maxPoints));
  const out: ChartPoint[] = [];
  let lastBucket = -1;

  for (const point of sorted) {
    const bucket = Math.floor((point.ts - from) / bucketMs);
    const converted = { t: Math.floor(point.ts / 1000), p: round(point.price, 2) };
    if (bucket !== lastBucket) {
      out.push(converted);
      lastBucket = bucket;
    } else {
      out[out.length - 1] = converted;
    }
  }
  return compactSeconds(out);
}

function compactSeconds(points: ChartPoint[]): ChartPoint[] {
  const out: ChartPoint[] = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (last && last.t === point.t) out[out.length - 1] = point;
    else out.push(point);
  }
  return out;
}
