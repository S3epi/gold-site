import { INSTRUMENT_BY_ID } from "../instruments.js";
import { fetchJson, isValidPrice, isValidTs, parseNumber } from "../parse.js";
import type { Quote } from "../types.js";

export async function fetchGoldOunce(
  url: string,
  timeoutMs: number,
  now = Date.now()
): Promise<Quote> {
  const raw = (await fetchJson(url, timeoutMs)) as {
    price?: unknown;
    updatedAt?: unknown;
  };
  const inst = INSTRUMENT_BY_ID.get("xau");
  if (!inst) throw new Error("xau instrument missing");

  const price = parseNumber(raw?.price);
  if (!isValidPrice(price, inst.bounds)) {
    throw new Error("gold-api: implausible price");
  }
  const parsedTs = typeof raw.updatedAt === "string" ? Date.parse(raw.updatedAt) : NaN;
  const ts = Number.isFinite(parsedTs) && isValidTs(parsedTs, now) ? parsedTs : now;

  return {
    instrumentId: "xau",
    price,
    ts,
    source: "gold-api",
    change: null,
    changePct: null,
    high: null,
    low: null
  };
}
