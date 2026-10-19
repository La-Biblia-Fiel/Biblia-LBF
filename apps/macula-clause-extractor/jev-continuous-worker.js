#!/usr/bin/env node
/**
 * Local, resumable dispatcher. It makes one checkpointed request per
 * unfinished route in each round and records its own state for the UI.
 */
import { mkdir, rename, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { acquireLock, releaseLock } from "./jev-budget.js";
import { recordWorkerPauseAlert } from "./worker-alerts.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const varDir = join(root, "var");
const lockPath = join(varDir, "jev-continuous-worker.lock");
const statusPath = join(varDir, "jev-continuous-worker-status.json");
const minIntervalMs = Number(process.env.JEV_MIN_INTERVAL_MS || 2500);
const sourceOnlyBatchSize = Number(process.env.JEV_SOURCE_ONLY_BATCH_SIZE || 25);
if (!Number.isFinite(minIntervalMs) || minIntervalMs < 0) throw new Error("JEV_MIN_INTERVAL_MS must be zero or greater");
if (!Number.isInteger(sourceOnlyBatchSize) || sourceOnlyBatchSize < 1) throw new Error("JEV_SOURCE_ONLY_BATCH_SIZE must be a positive integer");

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function writeStatus(value) {
  await mkdir(varDir, { recursive: true });
  const temporary = `${statusPath}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, statusPath);
}
function runOrchestrator() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, "jev-scan-orchestrator.js")], {
      cwd: root,
      env: { ...process.env, JEV_SCAN_ROUNDS: "1", JEV_WINDOWS_PER_RUN: "1", JEV_SOURCE_ONLY_BATCH_SIZE: String(sourceOnlyBatchSize), JEV_ROUTE_INTERVAL_MS: String(minIntervalMs) },
      stdio: ["ignore", "pipe", "inherit"],
    });
    let output = "";
    child.stdout.on("data", data => { output += data; });
    child.on("error", reject);
    child.on("close", code => {
      if (code !== 0) return reject(new Error(`orchestrator exited ${code}`));
      try { resolve(JSON.parse(output.trim().split("\n").at(-1))); }
      catch { reject(new Error("orchestrator produced invalid JSON status")); }
    });
  });
}

export async function main() {
  if (process.argv.includes("--dry-run")) {
    console.log(JSON.stringify({ status: "dry_run", policy: { one_annotated_ot_window_per_round: true, source_only_batch_size: sourceOnlyBatchSize, min_interval_ms: minIntervalMs, shared_budget: true, overlap_protection: true } }));
    return;
  }
  const lock = await acquireLock(lockPath);
  if (!lock) { console.log(JSON.stringify({ status: "overlap_prevented", lock: lockPath })); return; }
  const startedAt = new Date().toISOString();
  let rounds = 0;
  let explicitRecoveryWindow = process.env.JEV_EXPLICIT_RECOVERY_WINDOW || null;
  try {
    await writeStatus({ state: "running", pid: process.pid, started_at: startedAt, updated_at: startedAt, rounds_completed: rounds, min_interval_ms: minIntervalMs, source_only_batch_size: sourceOnlyBatchSize, last_cycle: null });
    while (true) {
      const cycleStartedAt = new Date().toISOString();
      let result;
      try {
        if (explicitRecoveryWindow) process.env.JEV_EXPLICIT_RECOVERY_WINDOW = explicitRecoveryWindow;
        else delete process.env.JEV_EXPLICIT_RECOVERY_WINDOW;
        result = await runOrchestrator();
        explicitRecoveryWindow = null;
      }
      catch (error) {
        const status = { state: "paused_error", pid: process.pid, started_at: startedAt, updated_at: new Date().toISOString(), rounds_completed: rounds, min_interval_ms: minIntervalMs, source_only_batch_size: sourceOnlyBatchSize, error: error.message };
        await writeStatus(status);
        await recordWorkerPauseAlert(root, status);
        throw error;
      }
      rounds++;
      const cycle = { started_at: cycleStartedAt, ended_at: new Date().toISOString(), result };
      const terminal = ["budget_limit", "systemic_error", "overlap_prevented", "eligible_routes_exhausted"].includes(result.status);
      const status = { state: terminal ? "paused" : "running", pid: process.pid, started_at: startedAt, updated_at: new Date().toISOString(), rounds_completed: rounds, min_interval_ms: minIntervalMs, source_only_batch_size: sourceOnlyBatchSize, last_cycle: cycle, pause_reason: terminal ? result.status : null };
      await writeStatus(status);
      if (terminal) await recordWorkerPauseAlert(root, status);
      if (terminal) { console.log(JSON.stringify({ status: "stopped", reason: result.status, rounds })); return; }
      await sleep(minIntervalMs);
    }
  } finally {
    await releaseLock(lock, lockPath);
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
