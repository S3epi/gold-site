import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type ObservationKind = "market" | "history";

export interface ObservationRow {
  ts: number;
  price: number;
  source?: string;
}

export interface ProviderHealthRow {
  name: string;
  ok: boolean;
  lastOk: number | null;
  lastTry: number | null;
  lastError: string | null;
  consecutiveFailures: number;
}

export class Storage {
  private db: DatabaseSync;

  constructor(dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true });
    this.db = new DatabaseSync(path.join(dataDir, "mesghalyar.db"));
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        instrument TEXT NOT NULL,
        ts INTEGER NOT NULL,
        price REAL NOT NULL,
        source TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'market',
        UNIQUE(instrument, ts, source)
      );
      CREATE INDEX IF NOT EXISTS idx_obs_instrument_ts ON observations(instrument, ts);
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS provider_health (
        name TEXT PRIMARY KEY,
        ok INTEGER NOT NULL,
        last_ok INTEGER,
        last_try INTEGER,
        last_error TEXT,
        consecutive_failures INTEGER NOT NULL DEFAULT 0
      );
    `);
  }

  insertObservation(
    instrument: string,
    ts: number,
    price: number,
    source: string,
    kind: ObservationKind = "market"
  ): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO observations (instrument, ts, price, source, kind)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(instrument, Math.round(ts), price, source, kind);
  }

  insertHistoryBatch(
    instrument: string,
    rows: ObservationRow[],
    source: string
  ): number {
    if (rows.length === 0) return 0;
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO observations (instrument, ts, price, source, kind)
       VALUES (?, ?, ?, ?, 'history')`
    );
    let inserted = 0;
    this.db.exec("BEGIN");
    try {
      for (const r of rows) {
        const res = stmt.run(instrument, Math.round(r.ts), r.price, source);
        inserted += Number(res.changes ?? 0);
      }
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
    return inserted;
  }

  lastObservation(instrument: string): (ObservationRow & { source: string }) | null {
    const row = this.db
      .prepare(
        `SELECT ts, price, source FROM observations
         WHERE instrument = ? ORDER BY ts DESC LIMIT 1`
      )
      .get(instrument) as { ts: number; price: number; source: string } | undefined;
    return row ? { ts: row.ts, price: row.price, source: row.source } : null;
  }

  observationBefore(instrument: string, ts: number): ObservationRow | null {
    const row = this.db
      .prepare(
        `SELECT ts, price FROM observations
         WHERE instrument = ? AND ts <= ?
         ORDER BY ts DESC LIMIT 1`
      )
      .get(instrument, Math.round(ts)) as { ts: number; price: number } | undefined;
    return row ? { ts: row.ts, price: row.price } : null;
  }

  observationsRange(instrument: string, fromTs: number, toTs: number): ObservationRow[] {
    return this.db
      .prepare(
        `SELECT ts, price, source FROM observations
         WHERE instrument = ? AND ts >= ? AND ts <= ?
         ORDER BY ts ASC`
      )
      .all(instrument, fromTs, toTs) as unknown as ObservationRow[];
  }

  countRange(instrument: string, fromTs: number, toTs: number): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS c FROM observations
         WHERE instrument = ? AND ts >= ? AND ts <= ?`
      )
      .get(instrument, fromTs, toTs) as { c: number };
    return row.c;
  }

  getSetting(key: string): string | null {
    const row = this.db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as
      | { value: string }
      | undefined;
    return row ? row.value : null;
  }

  setSetting(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(key, value);
  }

  saveProviderHealth(row: ProviderHealthRow): void {
    this.db
      .prepare(
        `INSERT INTO provider_health (name, ok, last_ok, last_try, last_error, consecutive_failures)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET
           ok = excluded.ok,
           last_ok = excluded.last_ok,
           last_try = excluded.last_try,
           last_error = excluded.last_error,
           consecutive_failures = excluded.consecutive_failures`
      )
      .run(
        row.name,
        row.ok ? 1 : 0,
        row.lastOk,
        row.lastTry,
        row.lastError,
        row.consecutiveFailures
      );
  }

  providerHealth(): ProviderHealthRow[] {
    const rows = this.db
      .prepare(
        `SELECT name, ok, last_ok, last_try, last_error, consecutive_failures
         FROM provider_health ORDER BY name`
      )
      .all() as unknown as {
      name: string;
      ok: number;
      last_ok: number | null;
      last_try: number | null;
      last_error: string | null;
      consecutive_failures: number;
    }[];
    return rows.map((r) => ({
      name: r.name,
      ok: r.ok === 1,
      lastOk: r.last_ok,
      lastTry: r.last_try,
      lastError: r.last_error,
      consecutiveFailures: r.consecutive_failures
    }));
  }

  close(): void {
    this.db.close();
  }
}
