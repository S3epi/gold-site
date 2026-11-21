import { fetchJson, isValidTs, parseNumber, parseTehranTs } from "../parse.js";

export interface WidgetEntry {
  key: string;
  price: number;
  change: number | null;
  changePct: number | null;
  high: number | null;
  low: number | null;
  /** Original TGJU quote time (`updated_at`), or null when the field is missing. */
  ts: number | null;
}

/**
 * Current values from the CORS-enabled TGJU widget endpoint.
 * `updated_at` is the provider's own quote time, so freshness can be measured
 * against the market instead of the moment the browser received the response.
 */
export async function fetchTgjuWidget(
  baseUrl: string,
  keys: string[],
  timeoutMs: number,
  opts: { bustCache?: boolean; now?: number } = {}
): Promise<Map<string, WidgetEntry>> {
  const now = opts.now ?? Date.now();
  // TGJU serves one frozen snapshot per exact `keys` string (order-sensitive)
  // and ignores `_` cache-busters, so a new unknown key is the only way to get
  // a fresh entry. The token is a shared 10s window, so cache growth stays bounded.
  const requestKeys = opts.bustCache ? [...keys, `_t${Math.floor(now / 10_000)}`] : keys;
  const url = `${baseUrl}?keys=${encodeURIComponent(requestKeys.join(","))}&lang=1&hl=0&index=0`;
  const raw = (await fetchJson(url, timeoutMs)) as {
    response?: {
      indicators?: {
        name?: string;
        p?: unknown;
        d?: unknown;
        dp?: unknown;
        h?: unknown;
        l?: unknown;
        updated_at?: unknown;
      }[];
    };
  };
  const list = raw?.response?.indicators;
  if (!Array.isArray(list)) throw new Error("TGJU widget: bad payload");

  const out = new Map<string, WidgetEntry>();
  for (const item of list) {
    if (!item?.name) continue;
    const price = parseNumber(item.p);
    if (price === null || price <= 0) continue;
    const parsedTs = parseTehranTs(item.updated_at);
    out.set(item.name, {
      key: item.name,
      price,
      change: parseNumber(item.d),
      changePct: parseNumber(item.dp),
      high: parseNumber(item.h),
      low: parseNumber(item.l),
      ts: isValidTs(parsedTs, now) ? parsedTs : null
    });
  }
  return out;
}
