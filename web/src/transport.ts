import {
  INSTRUMENTS,
  INSTRUMENT_BY_ID,
  PERIODS,
  aggregateChartPoints,
  buildPriceItems,
  computeCalculations,
  fetchGoldOunce,
  fetchJson,
  fetchTgjuHistory,
  fetchTgjuWidget,
  periodStart,
  round,
  type HistoryPayload,
  type HistoryPoint,
  type Instrument,
  type LiveEntry,
  type MarketStatus,
  type Period,
  type PeriodAvailability,
  type PlatformSnapshot,
  type PricesPayload
} from "@mesghalyar/shared";

const BASE = import.meta.env.BASE_URL;
const TGJU_WIDGET_URL = "https://api.tgju.org/v1/widget/tmp";
const TGJU_HISTORY_URL = "https://api.tgju.org/v1/market/indicator/summary-table-data";
const GOLDAPI_URL = "https://api.gold-api.com/price/XAU";
const PAXG_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd&include_last_updated_at=true";

async function fetchPaxgOunce(
  url: string,
  timeoutMs: number
): Promise<{ price: number; ts: number; source: string }> {
  const json = (await fetchJson(url, timeoutMs, { accept: "application/json" })) as {
    "pax-gold"?: { usd?: number; last_updated_at?: number };
  } | null;
  const row = json?.["pax-gold"];
  const price = row?.usd;
  if (typeof price !== "number" || !Number.isFinite(price) || price < 500 || price > 20_000) {
    throw new Error("paxg: implausible price");
  }
  return {
    price,
    ts: row?.last_updated_at ? row.last_updated_at * 1000 : Date.now(),
    source: "gold reference"
  };
}

export interface MarketTransport {
  mode: "server" | "static";
  prices(): Promise<PricesPayload>;
  history(instrumentId: string, period: Period): Promise<HistoryPayload>;
}

class ServerTransport implements MarketTransport {
  mode = "server" as const;

  async prices(): Promise<PricesPayload> {
    const res = await fetch(`${BASE}api/v1/prices`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15_000)
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const json = (await res.json()) as PricesPayload;
    if (!json?.ok) throw new Error("API payload invalid");
    return json;
  }

  async history(instrumentId: string, period: Period): Promise<HistoryPayload> {
    const res = await fetch(
      `${BASE}api/v1/history?instrument=${encodeURIComponent(instrumentId)}&period=${encodeURIComponent(period)}`,
      { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20_000) }
    );
    if (!res.ok) throw new Error(`API ${res.status}`);
    return (await res.json()) as HistoryPayload;
  }
}

/**
 * Static mode (e.g. GitHub Pages): reads real data directly from providers that
 * allow browser requests. TGJU's widget endpoint does not expose the original
 * market quote time, so domestic values are conservatively marked DELAYED.
 */
export class StaticTransport implements MarketTransport {
  mode = "static" as const;
  private entries = new Map<string, LiveEntry>();
  private forced = new Map<string, MarketStatus>();
  private tails = new Map<string, HistoryPoint[]>();
  private historyCache = new Map<string, { at: number; rows: HistoryPoint[] }>();
  private snapshotCache: { at: number; data: PlatformSnapshot | null } = { at: 0, data: null };
  private quality = { staleAfterMs: 30 * 60_000, liveWithinMs: 180_000, disputePct: 2 };

  private async loadSnapshot(): Promise<PlatformSnapshot | null> {
    if (Date.now() - this.snapshotCache.at < 45_000) return this.snapshotCache.data;
    try {
      const res = await fetch(`${BASE}api/v1/snapshot.json`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(12_000),
        cache: "no-store"
      });
      if (!res.ok) throw new Error(`snapshot ${res.status}`);
      const data = (await res.json()) as PlatformSnapshot;
      if (!data || typeof data.generatedAt !== "number" || !Array.isArray(data.history)) {
        throw new Error("snapshot payload invalid");
      }
      this.snapshotCache = { at: Date.now(), data };
      return data;
    } catch {
      this.snapshotCache = { at: Date.now(), data: this.snapshotCache.data };
      return this.snapshotCache.data;
    }
  }

  async prices(): Promise<PricesPayload> {
    const now = Date.now();
    const domesticKeys = INSTRUMENTS.filter((i) => i.tgjuKey).map((i) => i.tgjuKey as string);
    const extraKeys = ["tether_gold_xaut", "ons"];

    const [snapshot, widget, goldFirst, paxg] = await Promise.all([
      this.loadSnapshot(),
      fetchTgjuWidget(TGJU_WIDGET_URL, [...domesticKeys, ...extraKeys], 15_000).catch(() => null),
      fetchGoldOunce(GOLDAPI_URL, 15_000, now).catch(() => null),
      fetchPaxgOunce(PAXG_URL, 15_000).catch(() => null)
    ]);

    const intl = goldFirst ?? paxg;

    let domesticOk = false;
    let intlOk = false;

    if (widget) {
      domesticOk = true;
      for (const inst of INSTRUMENTS) {
        if (!inst.tgjuKey) continue;
        const w = widget.get(inst.tgjuKey);
        if (!w) continue;
        this.entries.set(inst.id, {
          price: w.price,
          ts: now,
          receivedAt: now,
          source: "tgju (widget)",
          change: w.change,
          changePct: w.changePct,
          high: w.high,
          low: w.low
        });
        this.forced.set(inst.id, "DELAYED");
        this.recordTail(inst.id, now, w.price);
      }
    }

    if (intl) {
      intlOk = true;
      this.entries.set("xau", {
        price: intl.price,
        ts: intl.ts,
        receivedAt: now,
        source: intl.source,
        change: null,
        changePct: null,
        high: null,
        low: null
      });
      this.forced.delete("xau");
      this.recordTail("xau", now, intl.price);
    } else if (widget) {
      for (const key of ["tether_gold_xaut", "ons"]) {
        const w = widget.get(key);
        if (!w) continue;
        this.entries.set("xau", {
          price: w.price,
          ts: now,
          receivedAt: now,
          source: `tgju:${key}`,
          change: w.change,
          changePct: w.changePct,
          high: w.high,
          low: w.low
        });
        this.forced.set("xau", "DELAYED");
        this.recordTail("xau", now, w.price);
        break;
      }
    }

    const melted = snapshot?.item;
    if (melted && Number.isFinite(melted.priceRial) && melted.priceRial > 0) {
      const ts = snapshot.generatedAt;
      const age = now - ts;
      this.entries.set("melted18", {
        price: melted.priceRial,
        ts,
        receivedAt: now,
        source: "platform-consensus",
        change: null,
        changePct: melted.changePct,
        high: null,
        low: null
      });
      this.forced.set("melted18", age > this.quality.staleAfterMs ? "STALE" : "DELAYED");
      if (melted.disputed) this.forced.set("melted18", "DISPUTED");
      else if (melted.sourcesCount < 2 && age <= this.quality.staleAfterMs) {
        this.forced.set("melted18", "UNVERIFIED");
      }
      this.recordTail("melted18", ts, melted.priceRial);
    }

    if (!domesticOk && !intlOk && !melted) {
      throw new Error("منابع داده در دسترس نیستند");
    }

    const items = buildPriceItems(this.entries, now, this.quality, {
      forcedStatus: Object.fromEntries(this.forced) as Record<string, MarketStatus>
    });

    const overall =
      domesticOk && intlOk
        ? "ALL_CONNECTED"
        : !domesticOk && !intlOk
          ? "ALL_PROVIDERS_UNAVAILABLE"
          : "PARTIAL_CONNECTIVITY";

    return {
      ok: true,
      generatedAt: now,
      mode: "static",
      network: {
        domestic: domesticOk ? "CONNECTED" : "UNAVAILABLE",
        international: intlOk ? "CONNECTED" : "UNAVAILABLE",
        overall
      },
      items,
      ounce: items.find((i) => i.id === "xau") ?? null,
      usd: items.find((i) => i.id === "usd") ?? null,
      calculations: computeCalculations(items)
    };
  }

  private recordTail(id: string, ts: number, price: number): void {
    const arr = this.tails.get(id) ?? [];
    const last = arr[arr.length - 1];
    if (!last || last.price !== price || ts - last.ts >= 10 * 60_000) {
      arr.push({ ts, price });
      if (arr.length > 500) arr.shift();
      this.tails.set(id, arr);
    }
  }

  private async loadHistory(id: string): Promise<HistoryPoint[]> {
    const inst = INSTRUMENT_BY_ID.get(id);
    if (!inst?.tgjuSlug) return [];
    const cached = this.historyCache.get(id);
    if (cached && Date.now() - cached.at < 10 * 60_000) return cached.rows;
    try {
      const rows = await fetchTgjuHistory(TGJU_HISTORY_URL, inst.tgjuSlug, 25_000, 20_000);
      this.historyCache.set(id, { at: Date.now(), rows });
      return rows;
    } catch {
      return cached?.rows ?? [];
    }
  }

  private async platformHistory(inst: Instrument, period: Period): Promise<HistoryPayload> {
    const now = Date.now();
    const snapshot = await this.loadSnapshot();
    const rows: HistoryPoint[] = [];
    for (const p of snapshot?.history ?? []) {
      if (Number.isFinite(p.t) && Number.isFinite(p.p) && p.p > 0) {
        rows.push({ ts: p.t * 1000, price: p.p * 10 });
      }
    }
    const tail = this.tails.get(inst.id) ?? [];
    const dedup = new Map<number, number>();
    for (const row of [...rows, ...tail]) dedup.set(row.ts, row.price);
    const all = [...dedup.entries()].map(([ts, price]) => ({ ts, price }));
    const from = periodStart(period, now);
    const merged = all.filter((r) => r.ts >= from && r.ts <= now);
    const points = aggregateChartPoints(
      merged.map((r) => ({ ts: r.ts, price: round(r.price / 10) })),
      900
    );

    const periods = {} as Record<Period, PeriodAvailability>;
    for (const p of PERIODS) {
      const start = periodStart(p, now);
      const count = all.filter((r) => r.ts >= start && r.ts <= now).length;
      periods[p] = { available: count >= 2, count };
    }

    const lastPoint = merged.length ? merged[merged.length - 1] : null;
    return {
      instrument: {
        id: inst.id,
        title: inst.title,
        short: inst.short,
        unit: "TOMAN",
        category: inst.category
      },
      period,
      points,
      meta: {
        source: rows.length ? "platform-observations" : null,
        lastTs: lastPoint?.ts ?? null,
        granularity: "auto"
      },
      range: { from, to: now },
      periods
    };
  }

  async history(instrumentId: string, period: Period): Promise<HistoryPayload> {
    const inst = INSTRUMENT_BY_ID.get(instrumentId);
    if (!inst) throw new Error("unknown instrument");
    if (instrumentId === "melted18") return this.platformHistory(inst, period);
    const rows = await this.loadHistory(instrumentId);
    const tail = this.tails.get(instrumentId) ?? [];
    const now = Date.now();
    const dedup = new Map<number, number>();
    for (const row of [...rows, ...tail]) dedup.set(row.ts, row.price);
    const all = [...dedup.entries()].map(([ts, price]) => ({ ts, price }));
    const from = periodStart(period, now);
    const merged = all.filter((r) => r.ts >= from && r.ts <= now);
    const converted = merged.map((r) => ({
      ts: r.ts,
      price: inst.unit === "IRR" ? round(r.price / 10) : round(r.price, 2)
    }));
    const points = aggregateChartPoints(converted, 900);

    const periods = {} as Record<Period, PeriodAvailability>;
    for (const p of PERIODS) {
      const start = periodStart(p, now);
      const count = all.filter((r) => r.ts >= start && r.ts <= now).length;
      periods[p] = { available: count >= 2, count };
    }

    const lastPoint = merged.length ? merged[merged.length - 1] : null;
    return {
      instrument: {
        id: inst.id,
        title: inst.title,
        short: inst.short,
        unit: inst.unit === "IRR" ? "TOMAN" : "USD",
        category: inst.category
      },
      period,
      points,
      meta: {
        source: rows.length ? "tgju-history" : tail.length ? "browser-observation" : null,
        lastTs: lastPoint?.ts ?? null,
        granularity: "auto"
      },
      range: { from, to: now },
      periods
    };
  }
}

export async function createTransport(): Promise<MarketTransport> {
  try {
    const res = await fetch(`${BASE}api/health`, {
      signal: AbortSignal.timeout(4_000),
      headers: { accept: "application/json" }
    });
    if (res.ok) {
      const json = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      if (json?.ok) return new ServerTransport();
    }
  } catch {
    // fall through to static mode
  }
  return new StaticTransport();
}
