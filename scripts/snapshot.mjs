import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  fetchPlatformQuotes,
  platformConsensus,
  round
} from "../shared/dist/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, "../web/public/api/v1");
const outFile = path.join(publicDir, "snapshot.json");

const BASE = (process.env.SNAPSHOT_BASE_URL || "https://s3epi.github.io/gold-site").replace(/\/$/, "");
const URLS = {
  talasea: process.env.TALASEA_URL || "https://api.talasea.ir/api/market/getGoldPrice",
  milli: process.env.MILLI_URL || "https://milli.gold/",
  taline: process.env.TALINE_URL || "https://taline.ir/"
};
const TIMEOUT_MS = Number(process.env.PLATFORMS_TIMEOUT_MS || 20_000);
const MAX_HISTORY = 4320; // ~30 days at 10-minute cadence

async function loadPrevious() {
  try {
    const res = await fetch(`${BASE}/api/v1/snapshot.json`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15_000)
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || typeof json !== "object" || !Array.isArray(json.history)) return null;
    return json;
  } catch (err) {
    console.warn(`snapshot: previous snapshot unavailable (${err instanceof Error ? err.message : err})`);
    return null;
  }
}

const now = Date.now();
const previous = await loadPrevious();
const { prices, errors } = await fetchPlatformQuotes(URLS, TIMEOUT_MS, now);
for (const e of errors) console.warn(`snapshot source failed: ${e}`);
const consensus = platformConsensus(prices, Number(process.env.DISPUTE_THRESHOLD_PCT || 2));

let snapshot;
if (consensus) {
  const history = Array.isArray(previous?.history) ? [...previous.history] : [];
  const point = { t: Math.floor(now / 1000), p: round(consensus.priceRial / 10) };
  const lastIdx = history.length - 1;
  if (lastIdx >= 0 && history[lastIdx].t === point.t) history[lastIdx] = point;
  else history.push(point);
  history.sort((a, b) => a.t - b.t);
  const trimmed = history.slice(-MAX_HISTORY);

  snapshot = {
    ok: true,
    generatedAt: now,
    item: {
      id: "melted18",
      priceRial: consensus.priceRial,
      changePct: consensus.changePct,
      disputed: consensus.disputed,
      spreadPct: consensus.spreadPct,
      sourcesCount: consensus.sources.length
    },
    history: trimmed,
    ...(errors.length ? { note: "partial-sources" } : {})
  };
  console.log(
    `snapshot: melted18 ${consensus.priceRial} Rial from ${consensus.sources.length} source(s)` +
      (consensus.spreadPct !== null ? `, spread ${consensus.spreadPct}%` : "")
  );
} else {
  snapshot = {
    ok: false,
    generatedAt: typeof previous?.generatedAt === "number" ? previous.generatedAt : now,
    item: previous?.item ?? null,
    history: Array.isArray(previous?.history) ? previous.history : [],
    note: "no-sources"
  };
  console.warn("snapshot: no platform source responded; keeping previous values");
}

fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(snapshot)}\n`, "utf8");
console.log(`snapshot written: ${outFile}`);
