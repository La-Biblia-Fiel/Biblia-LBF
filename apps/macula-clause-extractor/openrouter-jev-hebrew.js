#!/usr/bin/env node
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { loadPassage } from "./src/extractor.js";
import { buildPropositions } from "./src/propositions.js";
import { JEV_STATE_BUILDER_VERSION, buildJevState, createReferentResolver, validateJevState } from "./src/jev-state.js";
import { OPENROUTER_DECISIONS_ENDPOINT, OPENROUTER_JEV_MODEL, validateOpenRouterDecision } from "./src/openrouter-decisions.js";
import { extractUsage, requestFingerprint, validateSystemOneResponse } from "./src/ollama-systemone.js";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const endpoint = option("--endpoint", process.env.OPENROUTER_DECISIONS_ENDPOINT || OPENROUTER_DECISIONS_ENDPOINT);
const model = option("--model", process.env.OPENROUTER_JEV_MODEL || OPENROUTER_JEV_MODEL);
const recordsDirectory = option("--records", join(appRoot, "var", "openrouter-jev-hebrew-v0.3.0"));
const selectedIds = new Set(["isa_53_04_2305300400720080_p1", "isa_53_05_2305300500410040_p1"]);
const fullIsaiahPilot = args.includes("--isaiah-53-4-6");
const retryFailed = args.includes("--retry-failed");
if (args.includes("--help")) {
  console.log("Usage: npm run openrouter:verify-hebrew-v3 -- [--endpoint URL] [--model ID] [--records DIRECTORY] [--retry-failed|--isaiah-53-4-6]");
  console.log("Default runs two Hebrew units. --isaiah-53-4-6 runs the ten canonical units, reusing any exact successful record and sending only missing units.");
  process.exit(0);
}
const readJson = async (path, fallback) => {
  try { return JSON.parse(await readFile(path, "utf8")); } catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
};
const env = await readFile(join(appRoot, ".env"), "utf8").catch(error => error.code === "ENOENT" ? "" : Promise.reject(error));
const key = process.env.OPENROUTER_API_KEY || env.match(/^OPENROUTER_API_KEY=(.+)$/mu)?.[1]?.trim();
if (!key) throw new Error("No OPENROUTER_API_KEY found in the local .env or environment.");

const analysis = buildPropositions(await loadPassage(repoRoot, { book: "Isaiah", chapter: 53, firstVerse: 4, lastVerse: fullIsaiahPilot ? 6 : 5 }));
const state = await buildJevState(analysis, { resolveReferent: createReferentResolver(repoRoot) });
const validation = validateJevState(state);
const requests = fullIsaiahPilot ? state.requests : state.requests.filter(request => selectedIds.has(request.proposition_id));
const expectedRequestCount = fullIsaiahPilot ? 10 : 2;
if (!validation.ok || requests.length !== expectedRequestCount) throw new Error(`Hebrew pilot preparation failed: ${JSON.stringify(validation.errors)}`);

await mkdir(recordsDirectory, { recursive: true });
const indexPath = join(recordsDirectory, "index.json");
const index = await readJson(indexPath, { schema_version: JEV_STATE_BUILDER_VERSION, attempts: [] });
const summaries = [];
for (const request of requests) {
  const payload = { ...request.payload, model };
  const fingerprint = requestFingerprint(payload);
  const matchingAttempts = index.attempts.filter(item => item.request_fingerprint === fingerprint && item.requested_model === model);
  const previous = matchingAttempts.find(item => item.status === "succeeded");
  if (previous) {
    const existing = await readJson(join(recordsDirectory, previous.file), null);
    if (existing) summaries.push({ proposition_id: existing.proposition_id, status: "reused_success", answers: existing.raw_response?.answers || null, usage: existing.usage, elapsed_ms: existing.elapsed_ms });
    console.log(`${request.proposition_id}\treused_${previous.status}\t${previous.file}`);
    continue;
  }
  if (matchingAttempts.length && !retryFailed) {
    console.log(`${request.proposition_id}\tnot_retried\t${matchingAttempts.at(-1).file}`);
    continue;
  }
  const payloadValidation = validateOpenRouterDecision(payload);
  const record = {
    schema_version: JEV_STATE_BUILDER_VERSION, provider_kind: "openrouter_decisions", endpoint, requested_model: model, served_model: null, provider: null,
    request_id: request.request_id, proposition_id: request.proposition_id, builder_version: request.local_record.builder_version,
    question_versions: Object.fromEntries(request.local_record.question_specification.map(question => [question.question_id, question.question_version])),
    request_fingerprint: fingerprint, builder_request_fingerprint: request.local_record.request_fingerprint,
    exact_api_request: payload, source_evidence: request.local_record.source_evidence, external_reference_targets: request.local_record.external_reference_targets,
    status: null, error: null, raw_response_text: null, raw_response: null, response_validation: null,
    usage: { input_tokens: null, output_tokens: null }, elapsed_ms: null, attempted_at: new Date().toISOString()
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
  const retrySuffix = matchingAttempts.length ? `.retry-${matchingAttempts.length}` : "";
  const file = `${request.proposition_id}.${fingerprint}${retrySuffix}.json`;
  await writeFile(join(recordsDirectory, file), `${JSON.stringify(record, null, 2)}\n`);
  index.attempts.push({ proposition_id: request.proposition_id, request_fingerprint: fingerprint, requested_model: model, served_model: record.served_model, status: record.status, file, attempted_at: record.attempted_at });
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  summaries.push({ proposition_id: record.proposition_id, status: record.status, answers: record.raw_response?.answers || null, usage: record.usage, elapsed_ms: record.elapsed_ms });
  console.log(`${request.proposition_id}\t${record.status}\t${record.elapsed_ms ?? "—"}ms`);
}
await writeFile(join(recordsDirectory, "summary.json"), `${JSON.stringify({ schema_version: JEV_STATE_BUILDER_VERSION, provider_kind: "openrouter_decisions", endpoint, requested_model: model, units: summaries }, null, 2)}\n`);
