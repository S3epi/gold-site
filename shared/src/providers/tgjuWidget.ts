import { fetchJson, parseNumber } from "../parse.js";

export interface WidgetEntry {
  key: string;
  price: number;
  change: number | null;
  changePct: number | null;
  high: number | null;
  low: number | null;
}

/**
 * Current values from the CORS-enabled TGJU widget endpoint.
 * Note: this endpoint exposes values but not the original market quote
 * timestamp, so callers must treat the freshness conservatively.
 */
export async function fetchTgjuWidget(
  baseUrl: string,
  keys: string[],
  timeoutMs: number
): Promise<Map<string, WidgetEntry>> {
  const url = `${baseUrl}?keys=${encodeURIComponent(keys.join(","))}&lang=1&hl=0&index=0`;
  const raw = (await fetchJson(url, timeoutMs)) as {
    response?: { indicators?: { name?: string; p?: unknown; d?: unknown; dp?: unknown; h?: unknown; l?: unknown }[] };
  };
  const list = raw?.response?.indicators;
  if (!Array.isArray(list)) throw new Error("TGJU widget: bad payload");

  const out = new Map<string, WidgetEntry>();
  for (const item of list) {
    if (!item?.name) continue;
    const price = parseNumber(item.p);
    if (price === null || price <= 0) continue;
    out.set(item.name, {
      key: item.name,
      price,
      change: parseNumber(item.d),
      changePct: parseNumber(item.dp),
      high: parseNumber(item.h),
      low: parseNumber(item.l)
    });
  }
  return out;
}
