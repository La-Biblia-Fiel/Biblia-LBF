#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { buildNarrativeSeparationVerification, validateNarrativeSeparationVerification } from "./src/narrative-separation-verification.js";
import { OPENROUTER_DECISIONS_ENDPOINT, OPENROUTER_JEV_MODEL } from "./src/openrouter-decisions.js";
import { extractUsage, requestFingerprint, validateSystemOneResponse } from "./src/ollama-systemone.js";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const recordsDirectory = join(appRoot, "var", "openrouter-jev-narrative-separation-v0.1.0");
const readJson = async (path, fallback) => { try { return JSON.parse(await readFile(path, "utf8")); } catch (error) { if (error.code === "ENOENT") return fallback; throw error; } };
const env = await readFile(join(appRoot, ".env"), "utf8").catch(error => error.code === "ENOENT" ? "" : Promise.reject(error));
const key = process.env.OPENROUTER_API_KEY || env.match(/^OPENROUTER_API_KEY=(.+)$/mu)?.[1]?.trim();
if (!key) throw new Error("No OPENROUTER_API_KEY found in the local .env or environment.");
const dryRun = await buildNarrativeSeparationVerification(repoRoot), payload = dryRun.payload, fingerprint = requestFingerprint(payload), localValidation = validateNarrativeSeparationVerification(dryRun);
const roughTokens = dryRun.local_record.token_estimate.estimated_input_tokens;
if (!localValidation.ok || payload.model !== OPENROUTER_JEV_MODEL || roughTokens >= 32_000) throw new Error(`Local preflight failed: ${JSON.stringify({ localValidation, roughTokens })}`);
await mkdir(recordsDirectory, { recursive: true });
const indexPath = join(recordsDirectory, "index.json"), index = await readJson(indexPath, { schema_version: "0.1.0", attempts: [] });
if (index.attempts.some(item => item.request_fingerprint === fingerprint)) { console.log(`not_retried\t${fingerprint}`); process.exit(0); }
const record = { schema_version: "0.1.0", verification_kind: "narrative_separation_with_positive_controls", provider_kind: "openrouter_decisions", endpoint: OPENROUTER_DECISIONS_ENDPOINT, requested_model: OPENROUTER_JEV_MODEL, served_model: null, provider: null, request_fingerprint: fingerprint, exact_api_request: payload, local_verification: dryRun.local_record, local_validation: localValidation, preflight: { context_limit_tokens: 32_000, rough_estimated_input_tokens: roughTokens, fits_rough_estimate: true }, status: null, error: null, raw_response_text: null, raw_response: null, response_validation: null, usage: { input_tokens: null, output_tokens: null }, elapsed_ms: null, attempted_at: new Date().toISOString() };
const started = performance.now();
try {
  const response = await fetch(OPENROUTER_DECISIONS_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(payload), signal: AbortSignal.timeout(120_000) });
  record.elapsed_ms = Math.round(performance.now() - started); record.raw_response_text = await response.text();
  try { record.raw_response = JSON.parse(record.raw_response_text); } catch { record.raw_response = { non_json_response: record.raw_response_text }; }
  record.served_model = record.raw_response?.model ?? null; record.provider = record.raw_response?.provider ?? null; record.usage = extractUsage(record.raw_response);
  record.response_validation = response.ok ? validateSystemOneResponse(record.raw_response, payload) : { ok: false, errors: [`http_${response.status}`] };
  record.status = response.ok && record.response_validation.ok ? "succeeded" : "malformed_response";
  record.error = record.status === "succeeded" ? null : response.ok ? record.response_validation.errors.join(", ") : record.raw_response_text.slice(0, 1000);
} catch (error) { record.elapsed_ms = Math.round(performance.now() - started); record.status = error.name === "TimeoutError" ? "interrupted" : "failed"; record.error = error.message; }
const file = `one-kings-13-narrative-separation.${fingerprint}.json`;
await writeFile(join(recordsDirectory, file), `${JSON.stringify(record, null, 2)}\n`);
index.attempts.push({ request_fingerprint: fingerprint, status: record.status, file, attempted_at: record.attempted_at, served_model: record.served_model });
await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
console.log(JSON.stringify({ status: record.status, file, usage: record.usage, elapsed_ms: record.elapsed_ms, error: record.error }));
