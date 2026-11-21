import type { Category } from "./instruments.js";
import type { TehranClock } from "./time.js";

export interface Quote {
  instrumentId: string;
  /** Price in provider unit: Rial for IRR instruments, USD for USD instruments */
  price: number;
  /** Provider observation timestamp (epoch ms) */
  ts: number;
  source: string;
  change?: number | null;
  changePct?: number | null;
  high?: number | null;
  low?: number | null;
}

export interface HistoryPoint {
  ts: number;
  price: number;
}

export type MarketStatus = "LIVE" | "DELAYED" | "STALE" | "UNAVAILABLE" | "DISPUTED" | "UNVERIFIED";

export interface Quality {
  staleAfterMs: number;
  liveWithinMs: number;
  disputePct: number;
}

export interface LiveEntry {
  price: number;
  ts: number;
  receivedAt: number;
  source: string;
  change?: number | null;
  changePct?: number | null;
  high?: number | null;
  low?: number | null;
}

export type Period = "today" | "24h" | "1w" | "1m" | "3m" | "6m" | "1y" | "all";

export interface ChartPoint {
  /** epoch seconds */
  t: number;
  p: number;
}

export interface HistoryMeta {
  source: string | null;
  lastTs: number | null;
  granularity: "auto" | "daily";
}

export interface PeriodAvailability {
  available: boolean;
  count: number;
}

export interface HistoryPayload {
  instrument: { id: string; title: string; short: string; unit: "TOMAN" | "USD"; category: Category };
  period: Period;
  points: ChartPoint[];
  meta: HistoryMeta;
  range: { from: number; to: number };
  periods: Record<Period, PeriodAvailability>;
}

export interface CalcBasis {
  ounceUsd: number;
  usdToman: number;
  ounceTs: number | null;
  usdTs: number | null;
}

export interface ItemCalc {
  kind: "platform-reference" | "theoretical-bubble";
  referenceToman?: number;
  premiumToman?: number;
  premiumPct?: number;
  intrinsicToman?: number;
  bubbleToman?: number;
  bubblePct?: number;
  basis: CalcBasis;
  disclaimer: string;
}

export interface PriceItem {
  id: string;
  title: string;
  short: string;
  category: Category;
  unit: "TOMAN" | "USD";
  price: number | null;
  change: number | null;
  changePct: number | null;
  high: number | null;
  low: number | null;
  ts: number | null;
  source: string | null;
  status: MarketStatus;
  spec?: { weightG: number; purity: number };
  calc?: ItemCalc | null;
  note?: string;
}

export interface NetworkStatus {
  domestic: "CONNECTED" | "UNAVAILABLE";
  international: "CONNECTED" | "UNAVAILABLE";
  overall: "ALL_CONNECTED" | "PARTIAL_CONNECTIVITY" | "ALL_PROVIDERS_UNAVAILABLE";
}

export interface CoinCalculation {
  id: string;
  title: string;
  marketToman: number;
  intrinsicToman: number;
  bubbleToman: number;
  bubblePct: number;
}

export interface CalculationsPayload {
  usdToman: number | null;
  ounceUsd: number | null;
  pureGramToman: number | null;
  gold18ReferenceToman: number | null;
  gold24ReferenceToman: number | null;
  gold740ReferenceToman: number | null;
  mithqalReferenceToman: number | null;
  coins: CoinCalculation[];
  basis: CalcBasis | null;
  disclaimer: string;
}

export interface PricesPayload {
  ok: true;
  generatedAt: number;
  mode: "server" | "static";
  network: NetworkStatus;
  items: PriceItem[];
  ounce: PriceItem | null;
  usd: PriceItem | null;
  calculations: CalculationsPayload;
}

export interface UsdCross {
  priceToman: number;
  ts: number;
  source: string;
}

/**
 * Reference clock for the site. `offsetMs` is added to the responding host's
 * `Date` header to obtain the authoritative Tehran time, so the browser never
 * relies on the visitor's device clock.
 */
export interface AppTimePayload {
  ok: boolean;
  source: "time.ir" | "host";
  offsetMs: number;
  epochMs: number | null;
  sampledAt: number;
  tehran: TehranClock;
  generatedAt: number;
}

/** Static snapshot published with the site so Pages can read platform trade prices without CORS. */
export interface PlatformSnapshot {
  ok: boolean;
  generatedAt: number;
  item: {
    id: "melted18";
    priceRial: number;
    changePct: number | null;
    disputed: boolean;
    spreadPct: number | null;
    sourcesCount: number;
  } | null;
  /** Real observations recorded by the snapshot job: epoch seconds, Toman per gram. */
  history: { t: number; p: number }[];
  note?: string;
}
