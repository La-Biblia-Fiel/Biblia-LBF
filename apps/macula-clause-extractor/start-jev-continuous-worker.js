#!/usr/bin/env node
/** Starts the worker as an independent local process and exits immediately. */
import { open } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));
const log = await open(join(root, "var", "jev-continuous-worker.log"), "a");
const child = spawn(process.execPath, [join(root, "jev-continuous-worker.js")], {
  cwd: root,
  env: process.env,
  detached: true,
  stdio: ["ignore", log.fd, log.fd],
});
child.unref();
await log.close();
console.log(JSON.stringify({ status: "started", pid: child.pid }));
