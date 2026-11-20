import { parseNumber, type UsdCross } from "@mesghalyar/shared";
import { config } from "../config.js";
import { fetchJson } from "../util.js";

/** Optional cross-check source for USD/Toman (USDT/IRT on Nobitex, Rial -> Toman). */
export class NobitexProvider {
  name = "nobitex";

  constructor(
    private opts = {
      url: config.nobitex.url,
      timeoutMs: config.nobitex.timeoutMs
    }
  ) {}

  async fetchUsdCross(now = Date.now()): Promise<UsdCross> {
    const raw = (await fetchJson(this.opts.url, this.opts.timeoutMs)) as {
      stats?: Record<string, { latest?: unknown }>;
    };
    const latest = parseNumber(raw?.stats?.["usdt-rls"]?.latest);
    if (latest === null || latest <= 0) throw new Error("nobitex: missing usdt-rls latest");
    const priceToman = latest / 10;
    if (priceToman < 1_000 || priceToman > 50_000_000) {
      throw new Error("nobitex: implausible USD price");
    }
    return { priceToman, ts: now, source: "nobitex (USDT/IRT)" };
  }
}
