/**
 * Refreshes the deployed snapshot without relying on GitHub's cron scheduler,
 * which has produced no runs for newly registered schedules since 2026-08-26.
 * Dispatches the Pages workflow through the authenticated gh CLI; the workflow
 * rebuilds the platform snapshot and the time.ir clock, then deploys.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const logDir = path.resolve(here, "../.tmp");
const logFile = path.join(logDir, "keepalive.log");

const repo = process.env.KEEPALIVE_REPO || "S3epi/gold-site";
const workflow = process.env.KEEPALIVE_WORKFLOW || "pages.yml";

function log(message) {
  const line = `${new Date().toISOString()} ${message}`;
  console.log(line);
  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(logFile, `${line}\n`, "utf8");
  } catch {
    // logging is best-effort
  }
}

function findGh() {
  const candidates = [
    process.env.GH_BIN,
    "gh",
    path.join(os.homedir(), ".local", "gh", "gh.exe"),
    path.join(os.homedir(), ".local", "gh", "gh")
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["--version"], { stdio: "ignore", timeout: 15_000 });
      return candidate;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

const gh = findGh();
if (!gh) {
  log("keepalive: gh CLI not found; nothing dispatched");
  process.exit(1);
}

let recent = [];
try {
  const raw = execFileSync(
    gh,
    ["run", "list", "--workflow", workflow, "--repo", repo, "--limit", "1", "--json", "status,createdAt"],
    { encoding: "utf8", timeout: 30_000 }
  );
  recent = JSON.parse(raw || "[]");
} catch (err) {
  log(`keepalive: could not read recent runs (${err instanceof Error ? err.message : err})`);
}

const latest = recent[0];
if (latest && ["queued", "in_progress", "requested", "waiting", "pending"].includes(latest.status)) {
  log(`keepalive: a run is already ${latest.status}; skipping`);
  process.exit(0);
}

try {
  execFileSync(gh, ["workflow", "run", workflow, "--repo", repo, "--ref", "main"], {
    encoding: "utf8",
    timeout: 60_000
  });
  log("keepalive: dispatched snapshot refresh");
} catch (err) {
  log(`keepalive: dispatch failed (${err instanceof Error ? err.message : err})`);
  process.exit(1);
}
