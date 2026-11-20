import { fetchJson, parseDayTs, parseNumber } from "../parse.js";
import type { HistoryPoint } from "../types.js";

/**
 * Daily closes from TGJU summary-table-data/{slug}.
 * Row shape: [open, low, high, close, change, changePct, date, jalaliDate]
 */
export async function fetchTgjuHistory(
  historyUrl: string,
  slug: string,
  timeoutMs: number,
  maxRows = 20_000
): Promise<HistoryPoint[]> {
  const raw = (await fetchJson(
    `${historyUrl}/${encodeURIComponent(slug)}`,
    timeoutMs
  )) as { data?: unknown[][] };
  if (!Array.isArray(raw?.data)) throw new Error(`TGJU history: bad payload for ${slug}`);

  const points: HistoryPoint[] = [];
  for (const row of raw.data) {
    if (!Array.isArray(row) || row.length < 8) continue;
    const close = parseNumber(row[3]);
    const ts = parseDayTs(row[6]);
    if (close === null || close <= 0 || close > 1e12 || ts === null) continue;
    points.push({ ts, price: close });
  }
  points.sort((a, b) => a.ts - b.ts);
  return points.slice(-maxRows);
}
