import {
  fetchPlatformQuotes,
  platformConsensus,
  type PlatformConsensus,
  type PlatformSources,
  type Quote
} from "@mesghalyar/shared";
import { config } from "../config.js";

/** Aggregates the online "آبشده ۱۸" trade price from independent platforms. */
export class PlatformsProvider {
  name = "platforms";

  constructor(
    private opts: {
      urls: PlatformSources;
      timeoutMs: number;
      disputePct: number;
    } = {
      urls: config.platforms.urls,
      timeoutMs: config.platforms.timeoutMs,
      disputePct: config.quality.disputePct
    }
  ) {}

  async fetchMelted18(now = Date.now()): Promise<{ quote: Quote; consensus: PlatformConsensus } | null> {
    const { prices } = await fetchPlatformQuotes(this.opts.urls, this.opts.timeoutMs, now);
    const consensus = platformConsensus(prices, this.opts.disputePct);
    if (!consensus) return null;
    const quote: Quote = {
      instrumentId: "melted18",
      price: consensus.priceRial,
      ts: now,
      source: "platforms",
      change: null,
      changePct: consensus.changePct,
      high: Math.max(...consensus.sources.map((s) => s.priceRial)),
      low: Math.min(...consensus.sources.map((s) => s.priceRial))
    };
    return { quote, consensus };
  }
}
