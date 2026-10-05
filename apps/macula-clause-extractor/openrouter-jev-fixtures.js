#!/usr/bin/env node
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { buildSemanticTemplateFixtures } from "./src/jev-state.js";
import { OPENROUTER_DECISIONS_ENDPOINT, OPENROUTER_JEV_MODEL, validateOpenRouterDecision } from "./src/openrouter-decisions.js";
import { extractUsage, requestFingerprint, validateSystemOneResponse } from "./src/ollama-systemone.js";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const endpoint = option("--endpoint", process.env.OPENROUTER_DECISIONS_ENDPOINT || OPENROUTER_DECISIONS_ENDPOINT);
const model = option("--model", process.env.OPENROUTER_JEV_MODEL || OPENROUTER_JEV_MODEL);
const recordsDirectory = option("--records", join(appRoot, "var", "openrouter-jev-template-fixtures-v0.3.0"));
if (args.includes("--help")) {
  console.log("Usage: npm run openrouter:verify-template-v3 -- [--endpoint URL] [--model ID] [--records DIRECTORY]");
  console.log("Runs only six v0.3 English fixtures sequentially. Matching saved attempts are reused; no attempt is retried automatically.");
  process.exit(0);
}

const readJson = async (path, fallback) => {
  try { return JSON.parse(await readFile(path, "utf8")); } catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
};
const apiKey = async () => {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const env = await readFile(join(appRoot, ".env"), "utf8").catch(error => error.code === "ENOENT" ? "" : Promise.reject(error));
  return env.match(/^OPENROUTER_API_KEY=(.+)$/mu)?.[1]?.trim() || null;
};
const key = await apiKey();
if (!key) throw new Error("No OPENROUTER_API_KEY found in the local .env or environment.");

await mkdir(recordsDirectory, { recursive: true });
const indexPath = join(recordsDirectory, "index.json");
const index = await readJson(indexPath, { schema_version: "0.1.0", attempts: [] });
const summaries = [];
for (const fixture of buildSemanticTemplateFixtures()) {
  const payload = { ...fixture.payload, model };
  const payloadValidation = validateOpenRouterDecision(payload);
  const fingerprint = requestFingerprint(payload);
  const previous = index.attempts.find(item => item.request_fingerprint === fingerprint && item.requested_model === model);
  if (previous) {
    const record = await readJson(join(recordsDirectory, previous.file), null);
    if (record) summaries.push({ proposition_id: record.proposition_id, status: "reused_success", answers: record.raw_response?.answers || null, usage: record.usage, elapsed_ms: record.elapsed_ms });
    console.log(`${fixture.proposition_id}\treused_${previous.status}\t${previous.file}`);
    continue;
  }
  const record = {
    schema_version: "0.3.0", provider: "openrouter_decisions", endpoint, requested_model: model, served_model: null, provider: null,
    request_id: fixture.request_id, proposition_id: fixture.proposition_id, builder_version: fixture.local_record.builder_version,
    question_versions: Object.fromEntries(fixture.local_record.question_specification.map(question => [question.question_id, question.question_version])),
    request_fingerprint: fingerprint, builder_request_fingerprint: fixture.local_record.request_fingerprint,
    fixture_expectations: fixture.local_record.fixture_expectations, exact_api_request: payload, status: null, error: null,
    raw_response_text: null, raw_response: null, response_validation: null, usage: { input_tokens: null, output_tokens: null }, elapsed_ms: null, attempted_at: new Date().toISOString()
  };
  if (!payloadValidation.ok) {
    record.status = "preflight_failed";
    record.error = payloadValidation.errors.join(", ");
  } else {
    const started = performance.now();
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(payload), signal: AbortSignal.timeout(120_000) });
      record.elapsed_ms = Math.round(performance.now() - started);
      record.raw_response_text = await response.text();
      try { record.raw_response = record.raw_response_text ? JSON.parse(record.raw_response_text) : null; } catch { record.raw_response = { non_json_response: record.raw_response_text }; }
      record.served_model = record.raw_response?.model ?? null;
      record.provider = record.raw_response?.provider ?? null;
      record.usage = extractUsage(record.raw_response);
      record.response_validation = response.ok ? validateSystemOneResponse(record.raw_response, payload) : { ok: false, errors: [`http_${response.status}`] };
      record.status = response.ok && record.response_validation.ok ? "succeeded" : "malformed_response";
      record.error = record.status === "succeeded" ? null : response.ok ? record.response_validation.errors.join(", ") : record.raw_response_text.slice(0, 1000);
    } catch (error) {
      record.elapsed_ms = Math.round(performance.now() - started);
      record.status = error.name === "TimeoutError" ? "interrupted" : "failed";
      record.error = error.message;
    }
  }
  const file = `${fixture.proposition_id}.${fingerprint}.json`;
  await writeFile(join(recordsDirectory, file), `${JSON.stringify(record, null, 2)}\n`);
  index.attempts.push({ proposition_id: fixture.proposition_id, request_fingerprint: fingerprint, requested_model: model, served_model: record.served_model, status: record.status, file, attempted_at: record.attempted_at });
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  summaries.push({ proposition_id: record.proposition_id, status: record.status, answers: record.raw_response?.answers || null, usage: record.usage, elapsed_ms: record.elapsed_ms });
  console.log(`${fixture.proposition_id}\t${record.status}\t${record.elapsed_ms ?? "—"}ms`);
}
await writeFile(join(recordsDirectory, "summary.json"), `${JSON.stringify({ schema_version: "0.3.0", provider: "openrouter_decisions", endpoint, requested_model: model, units: summaries }, null, 2)}\n`);
