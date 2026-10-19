import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";

export const workerAlertPath = root => join(root, "var", "jev-continuous-worker-alert.json");

async function writeJson(path, value) {
  await mkdir(join(path, ".."), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

function macNotification(title, message) {
  return new Promise(resolve => {
    if (process.platform !== "darwin") return resolve({ attempted: false, delivered: false, reason: "native_notifications_are_only_configured_for_macos" });
    const child = spawn("/usr/bin/osascript", ["-e", `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`], { stdio: "ignore" });
    child.once("error", error => resolve({ attempted: true, delivered: false, error: error.message }));
    child.once("close", code => resolve(code === 0 ? { attempted: true, delivered: true } : { attempted: true, delivered: false, error: `osascript exited ${code}` }));
  });
}

export async function recordWorkerPauseAlert(root, status) {
  const pause = status.pause_reason || status.error || "unknown_error";
  const notification = await macNotification("Biblia-LBF scan paused", `The Scripture scan paused: ${String(pause).replaceAll("_", " ")}. Open the local app to review and resume.`);
  const alert = { state: "pending", created_at: new Date().toISOString(), worker_pid: status.pid ?? null, pause_reason: pause, last_cycle: status.last_cycle || null, notification };
  await writeJson(workerAlertPath(root), alert);
  return alert;
}

export async function readWorkerAlert(root) {
  try { return JSON.parse(await readFile(workerAlertPath(root), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

export async function acknowledgeWorkerAlert(root) {
  const alert = await readWorkerAlert(root);
  if (!alert || alert.state === "acknowledged") return alert;
  const acknowledged = { ...alert, state: "acknowledged", acknowledged_at: new Date().toISOString() };
  await writeJson(workerAlertPath(root), acknowledged);
  return acknowledged;
}
