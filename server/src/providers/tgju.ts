import {
  INSTRUMENTS,
  fetchTgjuHistory,
  isValidPrice,
  isValidTs,
  parseNumber,
  parseTehranTs,
  type HistoryPoint,
  type Instrument,
  type Quote
} from "@mesghalyar/shared";
import { config } from "../config.js";
import { fetchJson } from "../util.js";

interface TgjuEntry {
  p?: unknown;
  d?: unknown;
  dp?: unknown;
  h?: unknown;
  l?: unknown;
  ts?: unknown;
}

export class TgjuProvider {
  name = "tgju";

  constructor(
    private opts = {
      ajaxUrl: config.domestic.ajaxUrl,
      historyUrl: config.domestic.historyUrl,
      timeoutMs: config.domestic.timeoutMs
    }
  ) {}

  async fetchCurrent(now = Date.now()): Promise<Quote[]> {
    const raw = (await fetchJson(this.opts.ajaxUrl, this.opts.timeoutMs)) as {
      current?: Record<string, TgjuEntry>;
    };
    const current = raw?.current;
    if (!current || typeof current !== "object") {
      throw new Error("TGJU: unexpected payload shape");
    }
    const quotes: Quote[] = [];
    for (const inst of INSTRUMENTS) {
      if (inst.id === "xau" && inst.fallbackTgjuKeys) {
        const fallback = this.fallbackOunceQuote(inst, current, now);
        if (fallback) quotes.push(fallback);
        continue;
      }
      if (!inst.tgjuKey) continue;
      const quote = this.parseEntry(inst, inst.tgjuKey, current[inst.tgjuKey], now);
      if (quote) quotes.push(quote);
    }
    return quotes;
  }

  private fallbackOunceQuote(
    inst: Instrument,
    current: Record<string, TgjuEntry>,
    now: number
  ): Quote | null {
    for (const key of inst.fallbackTgjuKeys ?? []) {
      const quote = this.parseEntry(inst, key, current[key], now);
      if (quote) return quote;
    }
    return null;
  }

  private parseEntry(
    inst: Instrument,
    key: string,
    entry: TgjuEntry | undefined,
    now: number
  ): Quote | null {
    if (!entry) return null;
    const price = parseNumber(entry.p);
    const ts = parseTehranTs(entry.ts);
    if (!isValidPrice(price, inst.bounds) || !isValidTs(ts, now)) return null;
    return {
      instrumentId: inst.id,
      price,
      ts,
      source: inst.fallbackTgjuKeys ? `tgju:${key}` : "tgju",
      change: parseNumber(entry.d),
      changePct: parseNumber(entry.dp),
      high: parseNumber(entry.h),
      low: parseNumber(entry.l)
    };
  }

  async fetchHistory(slug: string): Promise<HistoryPoint[]> {
    return fetchTgjuHistory(
      this.opts.historyUrl,
      slug,
      Math.max(this.opts.timeoutMs, 25_000),
      config.history.maxRows
    );
  }
}
