import {
  INSTRUMENTS,
  INSTRUMENT_BY_ID,
  PERIODS,
  aggregateChartPoints,
  baselineClose,
  buildPriceItems,
  changeToClose,
  computeCalculations,
  fetchGoldOunce,
  fetchJson,
  fetchTgjuHistory,
  fetchTgjuRecentCloses,
  fetchTgjuWidget,
  periodStart,
  round,
  type DailyClose,
  type HistoryPayload,
  type HistoryPoint,
  type Instrument,
  type LiveEntry,
  type MarketStatus,
  type Period,
  type PeriodAvailability,
  type PlatformSnapshot,
  type PricesPayload,
  type WidgetEntry
} from "@mesghalyar/shared";
import { referenceNow } from "./serverClock";

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
    ts: row?.last_updated_at ? row.last_updated_at * 1000 : referenceNow(),
    source: "gold reference"
  };
}

export interface MarketTransport {
  mode: "server" | "static";
  /** Last known real observations, for an instant first paint before the network answers. */
  initial?(): PricesPayload | null;
  prices(): Promise<PricesPayload>;
  history(instrumentId: string, period: Period): Promise<HistoryPayload>;
}

const STORE_ENTRIES = "mesghalyar.entries.v1";
const STORE_SNAPSHOT = "mesghalyar.snapshot.v1";
const STORE_CLOSES = "mesghalyar.closes.v1";
const STORE_INTL = "mesghalyar.intl.v1";

interface IntlQuote {
  price: number;
  ts: number;
  source: string;
  high: number | null;
  low: number | null;
}

function storeRead<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function storeWrite(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or disabled; the site still works without the cache
  }
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
 * allow browser requests. Domestic quotes carry TGJU's own `updated_at`, so
 * their freshness is measured against the market, not the response time.
 */
export class StaticTransport implements MarketTransport {
  mode = "static" as const;
  private entries = new Map<string, LiveEntry>();
  private forced = new Map<string, MarketStatus>();
  private tails = new Map<string, HistoryPoint[]>();
  private historyCache = new Map<string, { at: number; rows: HistoryPoint[] }>();
  private closesCache = new Map<string, { at: number; value: DailyClose[] }>();
  private snapshotCache: { at: number; data: PlatformSnapshot | null } = {
    at: Number.NEGATIVE_INFINITY,
    data: null
  };
  private lastIntl: IntlQuote | null = null;
  private intlTask: Promise<void> | null = null;
  private intlNextTryAt = 0;
  private intlFailures = 0;
  private closesTask: Promise<void> | null = null;
  private closesPrimed = false;
  private widgetRetryHoldUntil = 0;
  private quality = {
    staleAfterMs: 30 * 60_000,
    liveWithinMs: 180_000,
    disputePct: 2,
    maxSnapshotAgeMs: 30 * 60_000
  };

  constructor() {
    this.restore();
  }

  /**
   * Seeds the board from the last real observations stored by this browser.
   * Timestamps are preserved, so statuses are recomputed from actual age.
   */
  private restore(): void {
    const entries = storeRead<[string, LiveEntry][]>(STORE_ENTRIES);
    if (Array.isArray(entries)) {
      for (const [id, entry] of entries) {
        if (
          !entry ||
          typeof entry.price !== "number" ||
          !Number.isFinite(entry.price) ||
          entry.price <= 0 ||
          typeof entry.ts !== "number" ||
          !Number.isFinite(entry.ts) ||
          referenceNow() - entry.ts > 24 * 60 * 60_000
        ) {
          continue;
        }
        if (id === "melted18" && referenceNow() - entry.ts > this.quality.maxSnapshotAgeMs) continue;
        // Provider percentages never reach the first paint; changes are
        // recomputed below from the closes recorded by this browser.
        this.entries.set(id, { ...entry, change: null, changePct: null });
      }
    }
    const snapshot = storeRead<PlatformSnapshot>(STORE_SNAPSHOT);
    if (
      snapshot &&
      typeof snapshot.generatedAt === "number" &&
      Array.isArray(snapshot.history) &&
      snapshot.item
    ) {
      this.snapshotCache = { at: Number.NEGATIVE_INFINITY, data: snapshot };
    }

    const intl = storeRead<IntlQuote>(STORE_INTL);
    if (
      intl &&
      Number.isFinite(intl.price) &&
      intl.price >= 500 &&
      intl.price <= 20_000 &&
      Number.isFinite(intl.ts) &&
      referenceNow() - intl.ts <= 7 * 24 * 3600_000
    ) {
      this.lastIntl = {
        price: intl.price,
        ts: intl.ts,
        source: intl.source || "gold reference",
        high: typeof intl.high === "number" && Number.isFinite(intl.high) ? intl.high : null,
        low: typeof intl.low === "number" && Number.isFinite(intl.low) ? intl.low : null
      };
    }

    const saved = storeRead<{ savedAt?: number; values?: Record<string, DailyClose[]> }>(
      STORE_CLOSES
    );
    if (saved?.values && typeof saved.savedAt === "number") {
      const age = Math.max(0, Date.now() - saved.savedAt);
      if (age < 6 * 3600_000) {
        for (const [id, rows] of Object.entries(saved.values)) {
          if (Array.isArray(rows)) {
            this.closesCache.set(id, { at: performance.now() - age, value: rows });
          }
        }
      }
    }

    // Real recorded closes are enough to show the honest 24h change immediately,
    // before the first network round-trip finishes.
    this.applyChangesSync(referenceNow(), this.snapshotCache.data);
  }

  private persist(): void {
    storeWrite(STORE_ENTRIES, [...this.entries.entries()]);
  }

  private persistCloses(): void {
    const values: Record<string, DailyClose[]> = {};
    for (const [id, cached] of this.closesCache) {
      if (cached.value.length) values[id] = cached.value;
    }
    storeWrite(STORE_CLOSES, { savedAt: Date.now(), values });
  }

  initial(): PricesPayload | null {
    if (this.entries.size === 0) return null;
    const payload = this.buildPayload(referenceNow(), {
      domestic: false,
      international: false,
      cached: true
    });
    // The stamp should name the last real observation, not this page load.
    const lastTs = Math.max(...[...this.entries.values()].map((entry) => entry.ts));
    return { ...payload, generatedAt: lastTs };
  }

  private buildPayload(
    now: number,
    net: { domestic: boolean; international: boolean; cached?: boolean }
  ): PricesPayload {
    const items = buildPriceItems(this.entries, now, this.quality, {
      forcedStatus: Object.fromEntries(this.forced) as Record<string, MarketStatus>
    });
    const overall = net.cached
      ? "PARTIAL_CONNECTIVITY"
      : net.domestic && net.international
        ? "ALL_CONNECTED"
        : !net.domestic && !net.international
          ? "ALL_PROVIDERS_UNAVAILABLE"
          : "PARTIAL_CONNECTIVITY";
    return {
      ok: true,
      generatedAt: now,
      mode: "static",
      network: {
        domestic: net.domestic ? "CONNECTED" : "UNAVAILABLE",
        international: net.international ? "CONNECTED" : "UNAVAILABLE",
        overall
      },
      items,
      ounce: items.find((i) => i.id === "xau") ?? null,
      usd: items.find((i) => i.id === "usd") ?? null,
      calculations: computeCalculations(items)
    };
  }

  private async loadSnapshot(): Promise<PlatformSnapshot | null> {
    if (performance.now() - this.snapshotCache.at < 60_000) return this.snapshotCache.data;
    try {
      // Pages serves files with max-age=600; a per-minute URL skips the CDN copy
      // so a fresh deployment is visible within a minute.
      const bucket = Math.floor(referenceNow() / 60_000);
      const res = await fetch(`${BASE}api/v1/snapshot.json?t=${bucket}`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
        cache: "no-store"
      });
      if (!res.ok) throw new Error(`snapshot ${res.status}`);
      const data = (await res.json()) as PlatformSnapshot;
      if (!data || typeof data.generatedAt !== "number" || !Array.isArray(data.history)) {
        throw new Error("snapshot payload invalid");
      }
      this.snapshotCache = { at: performance.now(), data };
      storeWrite(STORE_SNAPSHOT, data);
      return data;
    } catch {
      this.snapshotCache = { at: performance.now(), data: this.snapshotCache.data };
      return this.snapshotCache.data;
    }
  }

  private async fetchWidget(now: number): Promise<Map<string, WidgetEntry> | null> {
    const keys = [
      ...INSTRUMENTS.filter((i) => i.tgjuKey).map((i) => i.tgjuKey as string),
      "tether_gold_xaut",
      "ons"
    ];
    const first = await fetchTgjuWidget(TGJU_WIDGET_URL, keys, 5_000, {
      bustCache: true,
      now
    }).catch(() => null);
    if (!first) return null;
    const newest = Math.max(0, ...[...first.values()].map((e) => e.ts ?? 0));
    const stale = newest > 0 && now - newest > 4 * 60_000;
    if (!stale || performance.now() < this.widgetRetryHoldUntil) return first;
    // One retry with a new cache token; if the market itself is quiet, back off
    // instead of doubling every poll.
    const retry = await fetchTgjuWidget(TGJU_WIDGET_URL, keys, 5_000, {
      bustCache: true,
      now: now + 10_000
    }).catch(() => null);
    const retried = retry ? Math.max(0, ...[...retry.values()].map((e) => e.ts ?? 0)) : 0;
    if (retry && retried > newest) return retry;
    this.widgetRetryHoldUntil = performance.now() + 10 * 60_000;
    return first;
  }

  async prices(): Promise<PricesPayload> {
    const now = referenceNow();

    // The international ounce refreshes in the background: domestic prices are
    // never blocked by a slow or unreachable global API.
    this.refreshIntl();

    const [snapshot, widget] = await Promise.all([this.loadSnapshot(), this.fetchWidget(now)]);

    const widgetOns = widget ? (widget.get("ons") ?? widget.get("tether_gold_xaut") ?? null) : null;
    const cachedIntl = this.lastIntl;
    const cachedAge = cachedIntl ? now - cachedIntl.ts : Infinity;
    const intl = cachedIntl && cachedAge <= 90_000
      ? {
          price: cachedIntl.price,
          ts: cachedIntl.ts,
          source: cachedIntl.source,
          delayed: false,
          high: cachedIntl.high,
          low: cachedIntl.low
        }
      : widgetOns
        ? {
            price: widgetOns.price,
            ts: widgetOns.ts ?? now,
            source: "tgju:ons",
            delayed: widgetOns.ts === null,
            high: widgetOns.high,
            low: widgetOns.low
          }
        : cachedIntl
          ? { ...cachedIntl, delayed: true }
          : null;

    let domesticOk = false;
    let intlOk = false;

    if (widget) {
      domesticOk = true;
      for (const inst of INSTRUMENTS) {
        if (!inst.tgjuKey) continue;
        const w = widget.get(inst.tgjuKey);
        if (!w) continue;
        const prev = this.entries.get(inst.id);
        // TGJU's CDN sometimes answers from an old replica; never regress a
        // newer quote to an older one.
        if (prev && w.ts !== null && prev.ts - w.ts > 60_000) continue;
        const ts = w.ts ?? prev?.ts ?? now;
        this.entries.set(inst.id, {
          price: w.price,
          ts,
          receivedAt: now,
          source: "tgju (widget)",
          change: null,
          changePct: null,
          high: w.high,
          low: w.low
        });
        // Without the provider timestamp the receipt time overstates freshness.
        if (w.ts === null) this.forced.set(inst.id, "DELAYED");
        else this.forced.delete(inst.id);
        this.recordTail(inst.id, ts, w.price);
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
        high: intl.high,
        low: intl.low
      });
      if (intl.delayed) this.forced.set("xau", "DELAYED");
      else this.forced.delete("xau");
      this.recordTail("xau", now, intl.price);
    }

    const melted = snapshot?.item;
    const meltedAge = melted ? referenceNow() - snapshot.generatedAt : Infinity;
    if (melted && Number.isFinite(melted.priceRial) && melted.priceRial > 0 && meltedAge <= this.quality.maxSnapshotAgeMs) {
      const ts = snapshot.generatedAt;
      this.entries.set("melted18", {
        price: melted.priceRial,
        ts,
        receivedAt: now,
        source: "platform-consensus",
        change: null,
        changePct: null,
        high: null,
        low: null
      });
      this.forced.set("melted18", "DELAYED");
      if (melted.disputed) this.forced.set("melted18", "DISPUTED");
      else if (melted.sourcesCount < 2) {
        this.forced.set("melted18", "UNVERIFIED");
      }
      this.recordTail("melted18", ts, melted.priceRial);
    } else {
      this.entries.delete("melted18");
      this.forced.delete("melted18");
    }

    if (!domesticOk && !intlOk && !this.entries.get("melted18")) {
      throw new Error("منابع داده در دسترس نیستند");
    }

    await this.apply24hChanges(now, snapshot, this.closesPrimed ? 0 : 1_500);
    this.closesPrimed = true;

    this.persist();
    return this.buildPayload(now, { domestic: domesticOk, international: intlOk });
  }

  /** Keeps the last real global ounce; backs off instead of hammering a blocked API. */
  private refreshIntl(): void {
    if (this.intlTask) return;
    const now = referenceNow();
    if (now < this.intlNextTryAt) return;
    this.intlNextTryAt = now + 20_000;
    this.intlTask = (async () => {
      try {
        const quote = await fetchGoldOunce(GOLDAPI_URL, 3_500, now);
        this.lastIntl = {
          price: quote.price,
          ts: quote.ts,
          source: quote.source,
          high: quote.high ?? null,
          low: quote.low ?? null
        };
        this.intlFailures = 0;
        storeWrite(STORE_INTL, this.lastIntl);
      } catch {
        try {
          const paxg = await fetchPaxgOunce(PAXG_URL, 3_000);
          this.lastIntl = {
            price: paxg.price,
            ts: paxg.ts,
            source: paxg.source,
            high: null,
            low: null
          };
          this.intlFailures = 0;
          storeWrite(STORE_INTL, this.lastIntl);
        } catch {
          this.intlFailures += 1;
          this.intlNextTryAt = referenceNow() + (this.intlFailures >= 2 ? 120_000 : 20_000);
        }
      } finally {
        this.intlTask = null;
      }
    })();
  }

  private async loadRecentCloses(id: string): Promise<DailyClose[]> {
    const inst = INSTRUMENT_BY_ID.get(id);
    if (!inst?.tgjuSlug) return [];
    const cached = this.closesCache.get(id);
    if (cached && performance.now() - cached.at < 5 * 60_000) return cached.value;
    try {
      const value = await fetchTgjuRecentCloses(TGJU_HISTORY_URL, inst.tgjuSlug, 4_000);
      // An empty answer is retried after a minute instead of being trusted for five.
      this.closesCache.set(id, {
        at: value.length ? performance.now() : performance.now() - 4 * 60_000,
        value: value.length ? value : (cached?.value ?? [])
      });
      return this.closesCache.get(id)?.value ?? [];
    } catch {
      this.closesCache.set(id, {
        at: performance.now() - 4 * 60_000,
        value: cached?.value ?? []
      });
      return cached?.value ?? [];
    }
  }

  /**
   * 24h change is computed here from real recorded closes, never copied from a
   * provider's own "change" field. The baseline is the newest close at or
   * before 24 hours ago; when none exists the change stays unknown.
   */
  private applyChangesSync(now: number, snapshot: PlatformSnapshot | null): void {
    const target = now - 24 * 3600_000;
    const oldest = now - 7 * 24 * 3600_000;

    for (const [id, entry] of this.entries) {
      if (id === "melted18") continue;
      const base = baselineClose(this.closesCache.get(id)?.value ?? [], target, entry.price);
      if (!base || base.ts < oldest) {
        entry.change = null;
        entry.changePct = null;
        continue;
      }
      const diff = changeToClose(entry.price, base.close);
      entry.change = diff.change;
      entry.changePct = diff.changePct;
    }

    const meltedEntry = this.entries.get("melted18");
    if (meltedEntry) {
      let baseToman: number | null = null;
      let baseTs = -Infinity;
      for (const p of snapshot?.history ?? []) {
        if (!Number.isFinite(p.t) || !Number.isFinite(p.p) || p.p <= 0) continue;
        const ts = p.t * 1000;
        if (ts <= target && ts > baseTs) {
          baseTs = ts;
          baseToman = p.p;
        }
      }
      if (baseToman !== null && baseTs >= oldest) {
        const diff = changeToClose(meltedEntry.price, baseToman * 10);
        meltedEntry.change = diff.change;
        meltedEntry.changePct = diff.changePct;
      } else {
        // Our own 24h history is still filling in; the platform quotes carry a
        // real 24h change for this same instrument, used as the honest fallback.
        const pct = snapshot?.item?.changePct ?? null;
        const snapshotFresh =
          snapshot !== null && now - snapshot.generatedAt <= this.quality.maxSnapshotAgeMs;
        if (snapshotFresh && pct !== null && Number.isFinite(pct) && Math.abs(pct) < 20) {
          meltedEntry.changePct = round(pct, 2);
          meltedEntry.change = Math.round((meltedEntry.price * pct) / (100 + pct));
        } else {
          meltedEntry.change = null;
          meltedEntry.changePct = null;
        }
      }
    }
  }

  /** Refreshes the recorded closes in the background; the board never waits for all of them. */
  private refreshCloses(): Promise<void> {
    if (this.closesTask) return this.closesTask;
    const stale = [...this.entries.keys()].filter((id) => {
      if (id === "melted18" || !INSTRUMENT_BY_ID.get(id)?.tgjuSlug) return false;
      const cached = this.closesCache.get(id);
      return !cached || performance.now() - cached.at >= 5 * 60_000;
    });
    if (stale.length === 0) return Promise.resolve();

    this.closesTask = (async () => {
      const workers = Array.from({ length: Math.min(6, stale.length) }, async () => {
        for (;;) {
          const id = stale.shift();
          if (!id) return;
          await this.loadRecentCloses(id);
        }
      });
      await Promise.all(workers);
      this.persistCloses();
    })().finally(() => {
      this.closesTask = null;
    });
    return this.closesTask;
  }

  private async apply24hChanges(
    now: number,
    snapshot: PlatformSnapshot | null,
    waitMs: number
  ): Promise<void> {
    const task = this.refreshCloses();
    // The first paint gets a short grace period; later polls never wait because
    // the cached closes are already enough to compute the same baseline.
    if (waitMs > 0) {
      await Promise.race([task, new Promise<void>((resolve) => setTimeout(resolve, waitMs))]);
    }
    this.applyChangesSync(now, snapshot);
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
    if (cached && performance.now() - cached.at < 10 * 60_000) return cached.rows;
    try {
      const rows = await fetchTgjuHistory(TGJU_HISTORY_URL, inst.tgjuSlug, 12_000, 20_000);
      this.historyCache.set(id, { at: performance.now(), rows });
      return rows;
    } catch {
      return cached?.rows ?? [];
    }
  }

  private async platformHistory(inst: Instrument, period: Period): Promise<HistoryPayload> {
    const now = referenceNow();
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
      periods[p] = { available: count >= (p === "today" ? 1 : 2), count };
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
    const now = referenceNow();
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
      periods[p] = { available: count >= (p === "today" ? 1 : 2), count };
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
