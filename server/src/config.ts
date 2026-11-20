import fs from "node:fs";
import path from "node:path";

try {
  if (fs.existsSync(".env")) process.loadEnvFile(".env");
} catch {
  // .env is optional
}

const num = (value: string | undefined, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const bool = (value: string | undefined, fallback: boolean): boolean =>
  value === undefined ? fallback : /^(1|true|yes|on)$/i.test(value);

export interface AppConfig {
  port: number;
  host: string;
  dataDir: string;
  logLevel: string;
  corsOrigins: string[];
  adminToken: string;
  domestic: {
    enabled: boolean;
    ajaxUrl: string;
    historyUrl: string;
    intervalMs: number;
    timeoutMs: number;
  };
  international: {
    enabled: boolean;
    url: string;
    intervalMs: number;
    timeoutMs: number;
  };
  nobitex: {
    enabled: boolean;
    url: string;
    intervalMs: number;
    timeoutMs: number;
  };
  quality: {
    staleAfterMs: number;
    liveWithinMs: number;
    disputePct: number;
    observationMinSpacingMs: number;
  };
  history: {
    seedEnabled: boolean;
    seedEveryMs: number;
    maxRows: number;
  };
}

export const config: AppConfig = {
  port: num(process.env.PORT, 3001),
  host: process.env.HOST || "0.0.0.0",
  dataDir: path.resolve(process.env.DATA_DIR || "./data"),
  logLevel: process.env.LOG_LEVEL || "info",
  corsOrigins: (process.env.CORS_ORIGIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  adminToken: process.env.ADMIN_TOKEN || "",
  domestic: {
    enabled: bool(process.env.TGJU_ENABLED, true),
    ajaxUrl: process.env.TGJU_AJAX_URL || "https://call1.tgju.org/ajax.json",
    historyUrl:
      process.env.TGJU_HISTORY_URL ||
      "https://api.tgju.org/v1/market/indicator/summary-table-data",
    intervalMs: num(process.env.DOMESTIC_INTERVAL_MS, 60_000),
    timeoutMs: num(process.env.DOMESTIC_TIMEOUT_MS, 15_000)
  },
  international: {
    enabled: bool(process.env.GOLDAPI_ENABLED, true),
    url: process.env.GOLDAPI_URL || "https://api.gold-api.com/price/XAU",
    intervalMs: num(process.env.INTERNATIONAL_INTERVAL_MS, 60_000),
    timeoutMs: num(process.env.INTERNATIONAL_TIMEOUT_MS, 15_000)
  },
  nobitex: {
    enabled: bool(process.env.NOBITEX_ENABLED, false),
    url:
      process.env.NOBITEX_URL ||
      "https://api.nobitex.ir/market/stats?srcCurrency=usdt&dstCurrency=rls",
    intervalMs: num(process.env.NOBITEX_INTERVAL_MS, 120_000),
    timeoutMs: num(process.env.NOBITEX_TIMEOUT_MS, 12_000)
  },
  quality: {
    staleAfterMs: num(process.env.STALE_AFTER_MS, 900_000),
    liveWithinMs: num(process.env.LIVE_WITHIN_MS, 180_000),
    disputePct: num(process.env.DISPUTE_THRESHOLD_PCT, 2),
    observationMinSpacingMs: num(process.env.OBSERVATION_MIN_SPACING_MS, 300_000)
  },
  history: {
    seedEnabled: bool(process.env.HISTORY_SEED_ENABLED, true),
    seedEveryMs: num(process.env.HISTORY_SEED_EVERY_MS, 6 * 3600_000),
    maxRows: num(process.env.HISTORY_SEED_MAX_ROWS, 20_000)
  }
};
