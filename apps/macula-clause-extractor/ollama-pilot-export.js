#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const recordsDirectory = option("--records", join(appRoot, "var", "ollama-systemone-pilot"));
const output = option("--output", "/tmp/isaiah-53-ollama-selected-audit.json");
const wanted = ["isa_53_04_2305300400720080_p1", "isa_53_05_2305300500410040_p1"];

const index = JSON.parse(await readFile(join(recordsDirectory, "index.json"), "utf8"));
const selected = await Promise.all(wanted.map(async proposition_id => {
  const attempt = index.attempts.find(item => item.proposition_id === proposition_id && item.status === "succeeded");
  if (!attempt) throw new Error(`No successful saved attempt for ${proposition_id}.`);
  const record = JSON.parse(await readFile(join(recordsDirectory, attempt.file), "utf8"));
  return {
    proposition_id: record.proposition_id,
    request_fingerprint: record.request_fingerprint,
    requested_model: record.requested_model,
    installed_model: record.installed_model,
    model_digest: record.model_digest,
    ollama_version: record.ollama_version,
    exact_api_request: record.exact_api_request,
    full_response_distributions: record.raw_response.answers,
    reported_usage: record.usage,
    elapsed_ms: record.elapsed_ms,
    response_validation: record.response_validation
  };
}));
await writeFile(output, `${JSON.stringify({ schema_version: "0.1.0", export_kind: "selected_ollama_pilot_audit", units: selected }, null, 2)}\n`);
console.log(output);
