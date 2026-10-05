#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { loadPassage } from "./src/extractor.js";
import { buildPropositions } from "./src/propositions.js";
import { buildJevState, buildSemanticTemplateControls, buildSemanticTemplateFixtures, createReferentResolver, validateJevState } from "./src/jev-state.js";
import { DEFAULT_NIMBLE_MODEL, DEFAULT_OLLAMA_SYSTEMONE_ENDPOINT, contextSettingsFromShow, extractUsage, requestFingerprint, serializeOllamaSystemOneDecision, validateOllamaSystemOnePayload, validateSystemOneResponse } from "./src/ollama-systemone.js";

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const appRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const endpoint = option("--endpoint", process.env.OLLAMA_SYSTEMONE_ENDPOINT || DEFAULT_OLLAMA_SYSTEMONE_ENDPOINT);
const model = option("--model", process.env.OLLAMA_MODEL || DEFAULT_NIMBLE_MODEL);
const templateVerification = args.includes("--template-verification");
const templateControlsOnly = args.includes("--template-controls-only");
const templateHebrewOnly = args.includes("--template-hebrew-only");
const templateV3Fixtures = args.includes("--template-v3-fixtures");
const recordsDirectory = option("--records", join(appRoot, "var", templateV3Fixtures ? "ollama-systemone-template-fixtures-v0.3.0" : templateControlsOnly ? "ollama-systemone-template-controls-v0.2.1" : templateHebrewOnly ? "ollama-systemone-template-hebrew-v0.2.1" : templateVerification ? "ollama-systemone-template-verification-v0.2.0" : "ollama-systemone-pilot"));
if (args.includes("--help")) {
  console.log("Usage: npm run ollama:pilot -- [--endpoint URL] [--model NAME] [--records DIRECTORY] [--template-verification|--template-controls-only|--template-hebrew-only|--template-v3-fixtures]");
  console.log("--template-v3-fixtures sends only six English v0.3 fixtures. All modes reuse matching saved attempts and never retry automatically.");
  process.exit(0);
}
const apiRoot = new URL(endpoint);
apiRoot.pathname = "/";
apiRoot.search = "";
const apiUrl = path => new URL(path, apiRoot).toString();

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}
async function postJson(url, body) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(120_000) });
  const text = await response.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: response.status, ok: response.ok, raw_text: text, json };
}
async function optionalPost(url, body) {
  try { return { available: true, value: await postJson(url, body) }; } catch (error) { return { available: false, error: error.message }; }
}
async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}
const safeName = text => text.replace(/[^a-zA-Z0-9._-]/gu, "_");

async function probe() {
  const [version, tags] = await Promise.all([getJson(apiUrl("/api/version")), getJson(apiUrl("/api/tags"))]);
  const installed = (tags.models || []).find(item => item.name === model || item.model === model || item.name === `${model}:latest` || item.model === `${model}:latest`);
  if (!installed) throw new Error(`Model ${model} is not listed by /api/tags.`);
  const installedModel = installed.name || installed.model || model;
  const showResult = await optionalPost(apiUrl("/api/show"), { model: installedModel });
  const show = showResult.available && showResult.value.ok ? showResult.value.json : null;
  return { ollama_version: version.version ?? null, installed_model: installedModel, model_digest: installed.digest ?? show?.details?.digest ?? null, show, show_error: showResult.available && !showResult.value.ok ? showResult.value.raw_text : showResult.error ?? null, context: contextSettingsFromShow(show) };
}

async function tokenPreflight(payload, context) {
  const content = JSON.stringify(payload);
  const result = await optionalPost(apiUrl("/api/tokenize"), { model, content });
  if (result.available && result.value.ok && Array.isArray(result.value.json?.tokens)) {
    const token_count = result.value.json.tokens.length;
    return { exact: true, token_count, supported_context_tokens: context.effective_tokens, ok: !context.effective_tokens || token_count <= context.effective_tokens, error: context.effective_tokens && token_count > context.effective_tokens ? "payload_exceeds_reported_context" : null };
  }
  return { exact: false, token_count: null, estimated_tokens: Math.ceil(Buffer.byteLength(content, "utf8") / 4), supported_context_tokens: context.effective_tokens, ok: true, limitation: "Ollama /api/tokenize was unavailable or did not return tokens; no source words, complements, or questions were truncated.", tokenizer_error: result.available ? result.value.raw_text : result.error };
}

function summary(record) {
  const answers = Object.entries(record.raw_response?.answers || {}).map(([id, answer]) => `${id}=${answer.choice}@${Math.max(...Object.values(answer.probabilities || { none: 0 })).toFixed(3)}`).join(", ");
  return `${record.proposition_id}\t${record.status}\t${answers || "—"}\tconfidence=${Object.values(record.raw_response?.answers || {})[0]?.confidence ?? "—"}\tin=${record.usage.input_tokens ?? "—"}\tout=${record.usage.output_tokens ?? "—"}\t${record.elapsed_ms ?? "—"}ms`;
}

function compactSummary(record) {
  return {
    proposition_id: record.proposition_id,
    status: record.status,
    answers: Object.fromEntries(Object.entries(record.raw_response?.answers || {}).map(([id, answer]) => [id, { choice: answer.choice, leading_probability: Math.max(...Object.values(answer.probabilities || { none: 0 })), confidence: answer.confidence }])),
    input_tokens: record.usage.input_tokens,
    output_tokens: record.usage.output_tokens,
    elapsed_ms: record.elapsed_ms,
    error: record.error
  };
}

await mkdir(recordsDirectory, { recursive: true });
const indexPath = join(recordsDirectory, "index.json");
const index = await readJson(indexPath, { schema_version: "0.1.0", attempts: [] });
let report;
try {
  report = await probe();
} catch (error) {
  await writeFile(join(recordsDirectory, "probe-error.json"), `${JSON.stringify({ schema_version: "0.1.0", endpoint, requested_model: model, probed_at: new Date().toISOString(), status: "probe_failed", error: error.message }, null, 2)}\n`);
  throw error;
}
const analysis = buildPropositions(await loadPassage(repoRoot, { book: "Isaiah", chapter: 53, firstVerse: 4, lastVerse: 6 }));
const state = await buildJevState(analysis, { resolveReferent: createReferentResolver(repoRoot) });
const stateValidation = validateJevState(state);
const focusedHebrewIds = new Set(["isa_53_04_2305300400720080_p1", "isa_53_05_2305300500410040_p1"]);
const selectedHebrew = state.requests.filter(request => focusedHebrewIds.has(request.proposition_id));
const requests = templateV3Fixtures ? buildSemanticTemplateFixtures() : templateControlsOnly ? buildSemanticTemplateControls() : templateHebrewOnly ? selectedHebrew : templateVerification ? [...selectedHebrew, ...buildSemanticTemplateControls()] : state.requests;
const expectedRequestCount = templateV3Fixtures ? 6 : templateControlsOnly || templateHebrewOnly ? 2 : templateVerification ? 4 : 10;
if (!stateValidation.ok || requests.length !== expectedRequestCount) throw new Error(`Pilot preparation failed: ${JSON.stringify(stateValidation.errors)}`);
await writeFile(join(recordsDirectory, "preflight.json"), `${JSON.stringify({ endpoint, requested_model: model, probed_at: new Date().toISOString(), ...report }, null, 2)}\n`);
const summaries = [];

for (const request of requests) {
  const payload = serializeOllamaSystemOneDecision(request.payload, { model });
  const payloadValidation = validateOllamaSystemOnePayload(payload);
  const fingerprint = requestFingerprint(payload);
  const previous = index.attempts.find(item => item.request_fingerprint === fingerprint && item.model_digest === report.model_digest);
  if (previous) {
    const existing = await readJson(join(recordsDirectory, previous.file), null);
    if (existing) summaries.push(compactSummary(existing));
    console.log(`${request.proposition_id}\t${previous.status === "succeeded" ? "reused_success" : "not_retried"}\t${previous.file}`);
    continue;
  }
  const preflight = await tokenPreflight(payload, report.context);
  const record = {
    schema_version: "0.1.0", provider: "ollama_systemone", endpoint, requested_model: model, installed_model: report.installed_model, model_digest: report.model_digest, ollama_version: report.ollama_version,
    request_id: request.request_id, proposition_id: request.proposition_id, builder_version: state.builder_version, question_versions: Object.fromEntries(request.local_record.question_specification.map(question => [question.question_id, question.question_version])),
    request_fingerprint: fingerprint, builder_request_fingerprint: request.local_record.request_fingerprint, exact_api_request: payload, fixture_expectations: request.local_record.fixture_expectations ?? null, token_preflight: preflight, status: null, error: null, raw_response_text: null, raw_response: null, response_validation: null, usage: { input_tokens: null, output_tokens: null }, elapsed_ms: null, attempted_at: new Date().toISOString()
  };
  if (!payloadValidation.ok || !preflight.ok) {
    record.status = "preflight_failed";
    record.error = payloadValidation.ok ? preflight.error : payloadValidation.errors.join(", ");
  } else {
    const started = performance.now();
    try {
      const response = await postJson(endpoint, payload);
      record.elapsed_ms = Math.round(performance.now() - started);
      record.raw_response_text = response.raw_text;
      record.raw_response = response.json ?? { non_json_response: response.raw_text };
      record.usage = extractUsage(response.json);
      record.response_validation = response.ok ? validateSystemOneResponse(response.json, payload) : { ok: false, errors: [`http_${response.status}`] };
      record.status = response.ok && record.response_validation.ok ? "succeeded" : "malformed_response";
      record.error = record.status === "succeeded" ? null : response.ok ? record.response_validation.errors.join(", ") : response.raw_text.slice(0, 1000);
    } catch (error) {
      record.elapsed_ms = Math.round(performance.now() - started);
      record.status = error.name === "TimeoutError" ? "interrupted" : "failed";
      record.error = error.message;
    }
  }
  const file = `${safeName(request.proposition_id)}.${fingerprint}.json`;
  await writeFile(join(recordsDirectory, file), `${JSON.stringify(record, null, 2)}\n`);
  index.attempts.push({ proposition_id: request.proposition_id, request_fingerprint: fingerprint, model_digest: report.model_digest, status: record.status, file, attempted_at: record.attempted_at });
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  summaries.push(compactSummary(record));
  console.log(summary(record));
}
await writeFile(join(recordsDirectory, "summary.json"), `${JSON.stringify({ schema_version: "0.1.0", endpoint, requested_model: model, installed_model: report.installed_model, model_digest: report.model_digest, ollama_version: report.ollama_version, units: summaries }, null, 2)}\n`);
