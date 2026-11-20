import {
  INSTRUMENTS,
  INSTRUMENT_BY_ID,
  PERIODS,
  absDiffPct,
  aggregateChartPoints,
  buildPriceItems,
  computeCalculations,
  fetchGoldOunce,
  periodStart,
  round,
  type HistoryPayload,
  type LiveEntry,
  type MarketStatus,
  type NetworkStatus,
  type Period,
  type PeriodAvailability,
  type PriceItem,
  type PricesPayload,
  type Quality,
  type Quote
} from "@zernama/shared";
import { config } from "./config.js";
import { Storage } from "./db.js";
import { NobitexProvider } from "./providers/nobitex.js";
import { TgjuProvider } from "./providers/tgju.js";
import { errorMessage } from "./util.js";

export interface LoggerLike {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export interface ProviderState {
  ok: boolean | null;
  lastOk: number | null;
  lastTry: number | null;
  lastError: string | null;
  failures: number;
}

export type SettingsKey =
  | "domesticIntervalMs"
  | "internationalIntervalMs"
  | "staleAfterMs"
  | "liveWithinMs"
  | "disputePct";

export type SettingsPatch = Partial<Record<SettingsKey, number>>;

const PROVIDER_NAMES = {
  domestic: "tgju",
  international: "gold-api",
  nobitex: "nobitex"
} as const;

const SETTING_LIMITS: Record<SettingsKey, { min: number; max: number }> = {
  domesticIntervalMs: { min: 15_000, max: 3_600_000 },
  internationalIntervalMs: { min: 15_000, max: 3_600_000 },
  staleAfterMs: { min: 60_000, max: 86_400_000 },
  liveWithinMs: { min: 30_000, max: 3_600_000 },
  disputePct: { min: 0.1, max: 50 }
};

function freshState(): ProviderState {
  return { ok: null, lastOk: null, lastTry: null, lastError: null, failures: 0 };
}

export class Engine {
  private quotes = new Map<string, LiveEntry>();
  private ounceFallback: LiveEntry | null = null;
  private usdCross: { priceToman: number; ts: number; source: string } | null = null;
  private health: Record<keyof typeof PROVIDER_NAMES, ProviderState> = {
    domestic: freshState(),
    international: freshState(),
    nobitex: freshState()
  };
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private stopping = false;
  private domesticBusy = false;
  private seeding = false;
  private tgju = new TgjuProvider();
  private nobitex = new NobitexProvider();

  constructor(
    private storage: Storage,
    private logger: LoggerLike,
    private now: () => number = () => Date.now()
  ) {
    this.hydrate();
  }

  /** Restores the last stored value per instrument so a restart shows STALE instead of empty. */
  private hydrate(): void {
    for (const inst of INSTRUMENTS) {
      const last = this.storage.lastObservation(inst.id);
      if (!last) continue;
      this.quotes.set(inst.id, {
        price: last.price,
        ts: last.ts,
        receivedAt: last.ts,
        source: last.source,
        change: null,
        changePct: null,
        high: null,
        low: null
      });
    }
    const health = this.storage.providerHealth();
    for (const key of Object.keys(this.health) as (keyof typeof PROVIDER_NAMES)[]) {
      const row = health.find((h) => h.name === PROVIDER_NAMES[key]);
      if (!row) continue;
      this.health[key] = {
        ok: row.ok,
        lastOk: row.lastOk,
        lastTry: row.lastTry,
        lastError: row.lastError,
        failures: row.consecutiveFailures
      };
    }
  }

  start(): void {
    this.logger.info("engine: starting schedulers");
    this.scheduleLoop(
      "domestic",
      () => this.tickDomestic(),
      () => this.getInterval("domesticIntervalMs", config.domestic.intervalMs),
      0
    );
    if (config.international.enabled) {
      this.scheduleLoop(
        "international",
        () => this.tickInternational(),
        () => this.getInterval("internationalIntervalMs", config.international.intervalMs),
        1_500
      );
    }
    if (config.nobitex.enabled) {
      this.scheduleLoop("nobitex", () => this.tickNobitex(), () => config.nobitex.intervalMs, 4_000);
    }
    if (config.history.seedEnabled) {
      this.scheduleLoop(
        "history-seed",
        () => this.seedHistory(false),
        () => config.history.seedEveryMs,
        3_000
      );
    }
  }

  stop(): void {
    this.stopping = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  private scheduleLoop(
    name: string,
    fn: () => Promise<void>,
    intervalMs: () => number,
    firstDelay: number
  ): void {
    const run = async (): Promise<void> => {
      if (this.stopping) return;
      try {
        await fn();
      } catch (err) {
        this.logger.error(`engine ${name}: ${errorMessage(err)}`);
      }
      if (this.stopping) return;
      const handle = setTimeout(run, intervalMs());
      this.timers.add(handle);
    };
    const handle = setTimeout(run, firstDelay);
    this.timers.add(handle);
  }

  // ---------- ticks ----------

  private async tickDomestic(): Promise<void> {
    if (this.domesticBusy) return;
    this.domesticBusy = true;
    const now = this.now();
    try {
      const quotes = await this.tgju.fetchCurrent(now);
      if (quotes.length === 0) throw new Error("no valid quotes in payload");
      for (const q of quotes) {
        if (q.instrumentId === "xau") {
          this.ounceFallback = { ...q, receivedAt: now };
          continue;
        }
        this.acceptQuote(q, now);
      }
      this.markOk("domestic", now);
    } catch (err) {
      this.markFail("domestic", now, err);
    } finally {
      this.domesticBusy = false;
    }
  }

  private async tickInternational(): Promise<void> {
    const now = this.now();
    try {
      const quote = await fetchGoldOunce(config.international.url, config.international.timeoutMs, now);
      this.acceptQuote(quote, now);
      this.markOk("international", now);
    } catch (err) {
      this.markFail("international", now, err);
    }
  }

  private async tickNobitex(): Promise<void> {
    const now = this.now();
    try {
      const cross = await this.nobitex.fetchUsdCross(now);
      this.usdCross = cross;
      this.markOk("nobitex", now);
    } catch (err) {
      this.markFail("nobitex", now, err);
      this.usdCross = null;
    }
  }

  private acceptQuote(q: Quote, now: number): void {
    const prev = this.quotes.get(q.instrumentId);
    if (prev && q.ts < prev.ts) return;
    this.quotes.set(q.instrumentId, {
      price: q.price,
      ts: q.ts,
      receivedAt: now,
      source: q.source,
      change: q.change ?? null,
      changePct: q.changePct ?? null,
      high: q.high ?? null,
      low: q.low ?? null
    });
    this.persistIfSensible(q, now);
  }

  private persistIfSensible(q: Quote, now: number): void {
    const last = this.storage.lastObservation(q.instrumentId);
    if (!last) {
      this.storage.insertObservation(q.instrumentId, q.ts, q.price, q.source, "market");
      return;
    }
    const priceChanged = last.price !== q.price;
    const spaced = now - last.ts >= config.quality.observationMinSpacingMs;
    if (priceChanged || spaced) {
      this.storage.insertObservation(q.instrumentId, q.ts, q.price, q.source, "market");
    }
  }

  // ---------- history ----------

  async seedHistory(force: boolean): Promise<void> {
    if (this.seeding || !config.history.seedEnabled) return;
    const now = this.now();
    const lastSeed = Number(this.storage.getSetting("history.lastSeedAt") ?? 0);
    if (!force && now - lastSeed < config.history.seedEveryMs) return;

    this.seeding = true;
    this.logger.info("history: seeding daily closes from TGJU");
    try {
      let ok = 0;
      for (const inst of INSTRUMENTS) {
        if (!inst.tgjuSlug) continue;
        try {
          const rows = await this.tgju.fetchHistory(inst.tgjuSlug);
          if (rows.length > 0) {
            const inserted = this.storage.insertHistoryBatch(inst.id, rows, "tgju-history");
            ok += 1;
            this.logger.info(`history ${inst.id}: ${rows.length} rows, ${inserted} new`);
          }
        } catch (err) {
          this.logger.warn(`history ${inst.id}: ${errorMessage(err)}`);
        }
      }
      if (ok > 0) {
        this.storage.setSetting("history.lastSeedAt", String(this.now()));
        this.logger.info(`history: seeded ${ok} instruments`);
      }
    } finally {
      this.seeding = false;
    }
  }

  history(instrumentId: string, period: Period): HistoryPayload | null {
    const inst = INSTRUMENT_BY_ID.get(instrumentId);
    if (!inst) return null;
    const now = this.now();
    const from = periodStart(period, now);
    const rows = this.storage.observationsRange(instrumentId, from, now);
    const converted = rows.map((r) => ({
      ts: r.ts,
      price: inst.unit === "IRR" ? round(r.price / 10) : round(r.price, 2)
    }));
    const points = aggregateChartPoints(converted, 900);

    const periods = {} as Record<Period, PeriodAvailability>;
    for (const p of PERIODS) {
      const start = periodStart(p, now);
      const count = this.storage.countRange(instrumentId, start, now);
      periods[p] = { available: count >= 2, count };
    }

    const lastRow = rows.length > 0 ? rows[rows.length - 1] : null;
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
        source: lastRow?.source ?? this.quotes.get(inst.id)?.source ?? null,
        lastTs: lastRow?.ts ?? null,
        granularity: "auto"
      },
      range: { from, to: now },
      periods
    };
  }

  // ---------- payloads ----------

  private getInterval(key: "domesticIntervalMs" | "internationalIntervalMs", fallback: number): number {
    return this.readSettingNumber(key, fallback);
  }

  private readSettingNumber(key: SettingsKey, fallback: number): number {
    const raw = this.storage.getSetting(`settings.${key}`);
    if (raw === null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  quality(): Quality {
    return {
      staleAfterMs: this.readSettingNumber("staleAfterMs", config.quality.staleAfterMs),
      liveWithinMs: this.readSettingNumber("liveWithinMs", config.quality.liveWithinMs),
      disputePct: this.readSettingNumber("disputePct", config.quality.disputePct)
    };
  }

  settings(): Record<SettingsKey, number> {
    return {
      domesticIntervalMs: this.readSettingNumber("domesticIntervalMs", config.domestic.intervalMs),
      internationalIntervalMs: this.readSettingNumber(
        "internationalIntervalMs",
        config.international.intervalMs
      ),
      staleAfterMs: this.quality().staleAfterMs,
      liveWithinMs: this.quality().liveWithinMs,
      disputePct: this.quality().disputePct
    };
  }

  updateSettings(patch: SettingsPatch): Record<SettingsKey, number> {
    for (const [key, value] of Object.entries(patch) as [SettingsKey, number][]) {
      const limit = SETTING_LIMITS[key];
      if (!limit || !Number.isFinite(value) || value < limit.min || value > limit.max) {
        throw new Error(`invalid value for ${key}`);
      }
      this.storage.setSetting(`settings.${key}`, String(value));
    }
    return this.settings();
  }

  private resolveXau(): LiveEntry | null {
    const intl = this.quotes.get("xau") ?? null;
    const intlHealthy = this.health.international.ok === true;
    const intlFresh =
      intl !== null &&
      this.now() - intl.receivedAt <=
        5 * this.getInterval("internationalIntervalMs", config.international.intervalMs);

    if (intlHealthy && intl) return intl;
    if (intl && intlFresh) return intl;
    return this.ounceFallback ?? intl;
  }

  private buildEntries(): Map<string, LiveEntry | null> {
    const entries = new Map<string, LiveEntry | null>();
    for (const inst of INSTRUMENTS) {
      if (inst.id === "xau") {
        entries.set("xau", this.resolveXau());
      } else {
        entries.set(inst.id, this.quotes.get(inst.id) ?? null);
      }
    }
    return entries;
  }

  private disputedSet(now: number): Set<string> {
    const disputed = new Set<string>();
    const q = this.quality();
    const usd = this.quotes.get("usd");
    if (usd && this.usdCross && now - this.usdCross.ts < 10 * 60_000) {
      const diff = absDiffPct(usd.price / 10, this.usdCross.priceToman);
      if (diff > q.disputePct) disputed.add("usd");
    }
    return disputed;
  }

  networkStatus(): NetworkStatus {
    const domestic = this.health.domestic.ok === true ? "CONNECTED" : "UNAVAILABLE";
    const international = this.health.international.ok === true ? "CONNECTED" : "UNAVAILABLE";
    const overall =
      domestic === "CONNECTED" && international === "CONNECTED"
        ? "ALL_CONNECTED"
        : domestic === "UNAVAILABLE" && international === "UNAVAILABLE"
          ? "ALL_PROVIDERS_UNAVAILABLE"
          : "PARTIAL_CONNECTIVITY";
    return { domestic, international, overall };
  }

  prices(): PricesPayload {
    const now = this.now();
    const items = buildPriceItems(this.buildEntries(), now, this.quality(), {
      disputed: this.disputedSet(now)
    });
    return {
      ok: true,
      generatedAt: now,
      mode: "server",
      network: this.networkStatus(),
      items,
      ounce: items.find((i) => i.id === "xau") ?? null,
      usd: items.find((i) => i.id === "usd") ?? null,
      calculations: computeCalculations(items)
    };
  }

  status(): {
    generatedAt: number;
    network: NetworkStatus;
    providers: ReturnType<Engine["providersView"]>;
    instruments: { id: string; title: string; status: MarketStatus; ts: number | null; source: string | null }[];
  } {
    const payload = this.prices();
    return {
      generatedAt: payload.generatedAt,
      network: payload.network,
      providers: this.providersView(),
      instruments: payload.items.map((i: PriceItem) => ({
        id: i.id,
        title: i.title,
        status: i.status,
        ts: i.ts,
        source: i.source
      }))
    };
  }

  providersView(): {
    name: string;
    ok: boolean | null;
    lastOk: number | null;
    lastTry: number | null;
    lastError: string | null;
    consecutiveFailures: number;
    enabled: boolean;
  }[] {
    const enabled: Record<string, boolean> = {
      [PROVIDER_NAMES.domestic]: config.domestic.enabled,
      [PROVIDER_NAMES.international]: config.international.enabled,
      [PROVIDER_NAMES.nobitex]: config.nobitex.enabled
    };
    return (Object.keys(this.health) as (keyof typeof PROVIDER_NAMES)[]).map((key) => {
      const state = this.health[key];
      return {
        name: PROVIDER_NAMES[key],
        ok: state.ok,
        lastOk: state.lastOk,
        lastTry: state.lastTry,
        lastError: state.lastError,
        consecutiveFailures: state.failures,
        enabled: enabled[PROVIDER_NAMES[key]] ?? false
      };
    });
  }

  // ---------- health ----------

  private markOk(key: keyof typeof PROVIDER_NAMES, now: number): void {
    const state = this.health[key];
    const wasDown = state.ok === false;
    state.ok = true;
    state.lastOk = now;
    state.lastTry = now;
    state.lastError = null;
    state.failures = 0;
    if (wasDown) this.logger.info(`provider ${PROVIDER_NAMES[key]}: recovered`);
    this.storage.saveProviderHealth({
      name: PROVIDER_NAMES[key],
      ok: true,
      lastOk: now,
      lastTry: now,
      lastError: null,
      consecutiveFailures: 0
    });
  }

  private markFail(key: keyof typeof PROVIDER_NAMES, now: number, err: unknown): void {
    const state = this.health[key];
    const message = errorMessage(err);
    state.ok = false;
    state.lastTry = now;
    state.lastError = message;
    state.failures += 1;
    if (state.failures === 1 || state.failures % 10 === 0) {
      this.logger.warn(`provider ${PROVIDER_NAMES[key]}: ${message} (fails=${state.failures})`);
    }
    this.storage.saveProviderHealth({
      name: PROVIDER_NAMES[key],
      ok: false,
      lastOk: state.lastOk,
      lastTry: now,
      lastError: message.slice(0, 300),
      consecutiveFailures: state.failures
    });
  }
}
