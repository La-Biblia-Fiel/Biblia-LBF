#!/usr/bin/env node
/** One compact, non-retrying control request. Its result gates the Genesis tranche. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { buildNarrativeSeparationVerification, validateNarrativeSeparationVerification } from "./src/narrative-separation-verification.js";
import { compactNarrativeSeparationPayload, validateCompactNarrativeSeparationPayload } from "./src/candidate-scan-compact.js";
import { OPENROUTER_DECISIONS_ENDPOINT, OPENROUTER_JEV_MODEL } from "./src/openrouter-decisions.js";
import { extractUsage, requestFingerprint, validateSystemOneResponse } from "./src/ollama-systemone.js";

const appRoot = fileURLToPath(new URL(".", import.meta.url)), repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const recordsDirectory = join(appRoot, "var", "openrouter-jev-narrative-separation-compact-v0.2.0");
const readJson = async (path, fallback) => { try { return JSON.parse(await readFile(path, "utf8")); } catch (error) { if (error.code === "ENOENT") return fallback; throw error; } };
const env = await readFile(join(appRoot, ".env"), "utf8").catch(error => error.code === "ENOENT" ? "" : Promise.reject(error));
const key = process.env.OPENROUTER_API_KEY || env.match(/^OPENROUTER_API_KEY=(.+)$/mu)?.[1]?.trim();
if (!key) throw new Error("No OPENROUTER_API_KEY found in the local .env or environment.");
const full = await buildNarrativeSeparationVerification(repoRoot), compact = compactNarrativeSeparationPayload(full.payload), payload = compact.payload;
const fullValidation = validateNarrativeSeparationVerification(full), compactValidation = validateCompactNarrativeSeparationPayload(compact, full.payload), fingerprint = requestFingerprint(payload);
const roughTokens = Math.ceil(Buffer.byteLength(JSON.stringify(payload), "utf8") / 4);
if (!fullValidation.ok || !compactValidation.ok || payload.model !== OPENROUTER_JEV_MODEL || roughTokens >= 32_000) throw new Error(`Local preflight failed: ${JSON.stringify({ fullValidation, compactValidation, roughTokens })}`);
await mkdir(recordsDirectory, { recursive: true });
const indexPath = join(recordsDirectory, "index.json"), index = await readJson(indexPath, { schema_version: "0.2.0", attempts: [] });
if (index.attempts.some(item => item.request_fingerprint === fingerprint)) { console.log(JSON.stringify({ status: "reused_saved_result", request_fingerprint: fingerprint })); process.exit(0); }
const record = { schema_version: "0.2.0", verification_kind: "narrative_separation_with_positive_controls_compact", provider_kind: "openrouter_decisions", endpoint: OPENROUTER_DECISIONS_ENDPOINT, requested_model: OPENROUTER_JEV_MODEL, request_fingerprint: fingerprint, exact_api_request: payload, local_record: { ...compact.local_record, expected_candidate_answers: full.local_record.expected_candidate_answers }, local_validation: { full: fullValidation, compact: compactValidation }, preflight: { rough_estimated_input_tokens: roughTokens, context_limit_tokens: 32_000 }, status: null, error: null, raw_response_text: null, raw_response: null, response_validation: null, usage: { input_tokens: null, output_tokens: null }, elapsed_ms: null, attempted_at: new Date().toISOString() };
const started = performance.now();
try {
  const response = await fetch(OPENROUTER_DECISIONS_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(payload), signal: AbortSignal.timeout(120_000) });
  record.elapsed_ms = Math.round(performance.now() - started); record.raw_response_text = await response.text();
  try { record.raw_response = JSON.parse(record.raw_response_text); } catch { record.raw_response = { non_json_response: record.raw_response_text }; }
  record.usage = extractUsage(record.raw_response); record.served_model = record.raw_response?.model ?? null; record.provider = record.raw_response?.provider ?? null;
  record.response_validation = response.ok ? validateSystemOneResponse(record.raw_response, payload) : { ok: false, errors: [`http_${response.status}`] };
  record.status = response.ok && record.response_validation.ok ? "succeeded" : "malformed_response";
  record.error = record.status === "succeeded" ? null : response.ok ? record.response_validation.errors.join(", ") : record.raw_response_text.slice(0, 1000);
} catch (error) { record.elapsed_ms = Math.round(performance.now() - started); record.status = error.name === "TimeoutError" ? "interrupted" : "failed"; record.error = error.message; }
const answers = record.raw_response?.answers || {}, expected = record.local_record.expected_candidate_answers;
const observations = Object.entries(expected).map(([permanentId, expectedChoice]) => { const localId = Object.keys(record.local_record.question_map).find(key => record.local_record.question_map[key].permanent_question_id === permanentId); const answer = localId && answers[localId]; return { permanent_question_id: permanentId, expected: expectedChoice, observed: answer?.choice ?? null, probabilities: answer?.probabilities ?? null, pass: answer?.choice === expectedChoice }; });
record.control_comparison = { observations, narrative_separation_pass: observations.filter(item => item.expected === "no_support_in_supplied_context").every(item => item.pass), prediction_detection_pass: observations.filter(item => item.expected === "supported_candidate").every(item => item.pass) };
const file = `one-kings-13-narrative-separation-compact.${fingerprint}.json`; record.file = file;
await writeFile(join(recordsDirectory, file), `${JSON.stringify(record, null, 2)}\n`);
index.attempts.push({ request_fingerprint: fingerprint, status: record.status, file, attempted_at: record.attempted_at, served_model: record.served_model, usage: record.usage, control_comparison: record.control_comparison });
await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
console.log(JSON.stringify({ status: record.status, file, usage: record.usage, elapsed_ms: record.elapsed_ms, validation: record.response_validation, control_comparison: record.control_comparison, error: record.error }));
