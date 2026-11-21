import { normalizeDigits, parseNumber, USER_AGENT } from "../parse.js";

/** Online "آبشده ۱۸ عیار" trade prices from Iranian platforms. All values are Rial per gram. */
export interface PlatformPrice {
  id: "talasea" | "milli" | "taline";
  priceRial: number;
  changePct: number | null;
  fetchedAt: number;
}

export interface PlatformConsensus {
  id: "melted18";
  priceRial: number;
  changePct: number | null;
  disputed: boolean;
  spreadPct: number | null;
  sources: PlatformPrice[];
}

export const MELTED18_BOUNDS = { min: 100_000_000, max: 50_000_000_000 };

// 18k gram prices on these platforms have hovered around 2.3e9..2.5e9 Rial recently.
// Reject anything outside a wide but sane window so a layout change cannot inject garbage.
function inBounds(value: number | null): value is number {
  return value !== null && value >= MELTED18_BOUNDS.min && value <= MELTED18_BOUNDS.max;
}

function stripTags(html: string): string {
  return normalizeDigits(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  ).replace(/\s+/g, " ");
}

interface HeaderLike {
  getSetCookie?: () => string[];
}

/** Some Iranian CDNs answer with a cookie-challenge 307 before serving HTML. */
async function fetchTextCookied(url: string, timeoutMs: number): Promise<string> {
  let cookie = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await fetch(url, {
      redirect: "manual",
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "fa-IR,fa;q=0.9",
        "user-agent": USER_AGENT,
        ...(cookie ? { cookie } : {})
      },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (res.status >= 300 && res.status < 400) {
      const setCookies = (res.headers as unknown as HeaderLike).getSetCookie?.() ?? [];
      if (setCookies.length === 0) throw new Error(`${hostOf(url)}: redirect without cookies`);
      cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
      continue;
    }
    if (!res.ok) throw new Error(`${hostOf(url)}: HTTP ${res.status}`);
    return await res.text();
  }
  throw new Error(`${hostOf(url)}: redirect loop`);
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "provider";
  }
}

/** Talasea exposes its live trade price in thousand Toman. */
export async function fetchTalaseaPrice(
  url: string,
  timeoutMs: number,
  now = Date.now()
): Promise<PlatformPrice> {
  const res = await fetch(url, {
    headers: { accept: "application/json", "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!res.ok) throw new Error(`talasea: HTTP ${res.status}`);
  const raw = (await res.json()) as { price?: unknown; change24h?: unknown } | null;
  const thousandToman = parseNumber(raw?.price);
  const priceRial = thousandToman === null ? null : thousandToman * 10_000;
  if (!inBounds(priceRial)) throw new Error("talasea: implausible price");
  return {
    id: "talasea",
    priceRial,
    changePct: parseNumber(raw?.change24h),
    fetchedAt: now
  };
}

/**
 * Milli's public JSON endpoint (server-side only; its CDN rejects browser
 * origins). `price18` is in thousand Rial.
 */
async function fetchMilliJson(
  url: string,
  timeoutMs: number,
  now: number
): Promise<PlatformPrice | null> {
  const api = new URL("/api/v1/public/milli-price/external", url).toString();
  const res = await fetch(api, {
    headers: { accept: "application/json", "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!res.ok) return null;
  const raw = (await res.json()) as { data?: { price18?: unknown } } | null;
  const thousandRial = parseNumber(raw?.data?.price18);
  const priceRial = thousandRial === null ? null : thousandRial * 1_000;
  if (!inBounds(priceRial)) return null;
  return { id: "milli", priceRial, changePct: null, fetchedAt: now };
}

/** Milli renders "۲۳۵,۴۹۰,۰۰۰ ریال — قیمت ۱ گرم طلای ۱۸ عیار" server-side. */
export async function fetchMilliPrice(
  url: string,
  timeoutMs: number,
  now = Date.now()
): Promise<PlatformPrice> {
  try {
    const fromApi = await fetchMilliJson(url, timeoutMs, now);
    if (fromApi) return fromApi;
  } catch {
    // fall through to the HTML page
  }
  const text = stripTags(await fetchTextCookied(url, timeoutMs));
  const m = text.match(/([0-9,]+)\s*ریال\s*قیمت\s*1\s*گرم\s*طلای\s*18\s*عیار/);
  const priceRial = parseNumber(m?.[1]);
  if (!inBounds(priceRial)) throw new Error("milli: price not found");
  const c = text.match(/([0-9.]+)\s*%\s*تغییرات/);
  return {
    id: "milli",
    priceRial,
    changePct: parseNumber(c?.[1]),
    fetchedAt: now
  };
}

/** Taline publishes its live price in the page description: "قیمت لحظه ای ۲۳,۶۳۴,۰۰۰ تومان". */
export async function fetchTalinePrice(
  url: string,
  timeoutMs: number,
  now = Date.now()
): Promise<PlatformPrice> {
  const text = normalizeDigits(await fetchTextCookied(url, timeoutMs));
  const m = text.match(/قیمت لحظه\s*ای\s*([0-9,]+)\s*تومان/);
  const toman = parseNumber(m?.[1]);
  const priceRial = toman === null ? null : toman * 10;
  if (!inBounds(priceRial)) throw new Error("taline: price not found");
  return { id: "taline", priceRial, changePct: null, fetchedAt: now };
}

export interface PlatformSources {
  talasea: string;
  milli: string;
  taline: string;
}

/** Median of what succeeded; DISPUTED when the spread across at least two sources exceeds the threshold. */
export function platformConsensus(
  prices: PlatformPrice[],
  disputePct = 2
): PlatformConsensus | null {
  const valid = prices.filter((p) => inBounds(p.priceRial));
  if (valid.length === 0) return null;

  const sorted = [...valid].sort((a, b) => a.priceRial - b.priceRial);
  const mid = Math.floor(sorted.length / 2);
  const priceRial =
    sorted.length % 2 === 1
      ? sorted[mid].priceRial
      : Math.round((sorted[mid - 1].priceRial + sorted[mid].priceRial) / 2);

  const spreadPct =
    sorted.length >= 2 ? ((sorted[sorted.length - 1].priceRial - sorted[0].priceRial) / priceRial) * 100 : null;

  const changes = valid
    .map((p) => p.changePct)
    .filter((c): c is number => c !== null && Number.isFinite(c))
    .sort((a, b) => a - b);
  const changePct = changes.length ? changes[Math.floor(changes.length / 2)] : null;

  return {
    id: "melted18",
    priceRial,
    changePct,
    disputed: spreadPct !== null && spreadPct > disputePct,
    spreadPct: spreadPct === null ? null : Math.round(spreadPct * 100) / 100,
    sources: valid
  };
}

export async function fetchPlatformQuotes(
  urls: PlatformSources,
  timeoutMs: number,
  now = Date.now()
): Promise<{ prices: PlatformPrice[]; errors: string[] }> {
  const settled = await Promise.allSettled([
    fetchTalaseaPrice(urls.talasea, timeoutMs, now),
    fetchMilliPrice(urls.milli, timeoutMs, now),
    fetchTalinePrice(urls.taline, timeoutMs, now)
  ]);
  const prices: PlatformPrice[] = [];
  const errors: string[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") prices.push(result.value);
    else errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
  }
  return { prices, errors };
}
