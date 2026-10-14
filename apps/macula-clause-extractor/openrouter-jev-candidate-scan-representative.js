#!/usr/bin/env node
/** One-shot, sequential execution of the prepared four-window representative batch. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { buildCandidateScanLedger, buildRepresentativeBatch } from "./src/candidate-scan.js";
import { OPENROUTER_DECISIONS_ENDPOINT, OPENROUTER_JEV_MODEL } from "./src/openrouter-decisions.js";
import { extractUsage, validateSystemOneResponse } from "./src/ollama-systemone.js";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const recordsDirectory = join(appRoot, "var", "openrouter-jev-candidate-scan-representative-v0.1.0");
const ledgerPath = join(appRoot, "var", "candidate-scan-v0.1.0", "ledger.json");
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const readJson = async (path, fallback) => { try { return JSON.parse(await readFile(path, "utf8")); } catch (error) { if (error.code === "ENOENT") return fallback; throw error; } };
const env = await readFile(join(appRoot, ".env"), "utf8").catch(error => error.code === "ENOENT" ? "" : Promise.reject(error));
const key = process.env.OPENROUTER_API_KEY || env.match(/^OPENROUTER_API_KEY=(.+)$/mu)?.[1]?.trim();
if (!key) throw new Error("No OPENROUTER_API_KEY found in the local .env or environment.");

await mkdir(recordsDirectory, { recursive: true });
const indexPath = join(recordsDirectory, "index.json"), index = await readJson(indexPath, { schema_version: "0.1.0", attempts: [] });
const batch = await buildRepresentativeBatch(repoRoot);
let ledger = await readJson(ledgerPath, null);
if (!ledger) ledger = await buildCandidateScanLedger(repoRoot);
const cap = ledger.spending_cap, originalSpent = cap.spent_input_tokens || 0;
const summaries = [];

function addResultToInventory(caseId, request, record) {
  if (record.status !== "succeeded") return;
  const byReference = new Map(ledger.verses.map(item => [`${item.book}:${item.chapter}:${item.verse}`, item]));
  for (const unit of request.state.statements) {
    const answer = record.raw_response.answers?.[`${unit.statement_id}:candidate_assessment`];
    if (!answer) continue;
    const row = byReference.get(`${unit.reference.book}:${unit.reference.chapter}:${unit.reference.verse}`);
    if (!row) continue;
    const assessment = answer.choice, probability = answer.probabilities?.[assessment] ?? null;
    const statement = { statement_id: unit.statement_id, source_text: unit.source_text, assessment, probability, probabilities: answer.probabilities, evidence_kind: "representative_candidate_scan", record_file: record.file, case_id: caseId };
    row.statements = row.statements.filter(item => !(item.statement_id === statement.statement_id && item.evidence_kind === statement.evidence_kind));
    row.statements.push(statement);
    if (["supported_candidate", "possible_candidate"].includes(assessment)) row.status = "candidate";
    else if (assessment === "underdetermined" && row.status !== "candidate") row.status = "uncertain";
    else if (row.status === "unprocessed") row.status = "processed";
    ledger.candidates = ledger.candidates.filter(item => !(item.statement_id === statement.statement_id && item.evidence_kind === statement.evidence_kind));
    if (["supported_candidate", "possible_candidate", "underdetermined"].includes(assessment)) ledger.candidates.push({ reference: `${unit.reference.book} ${unit.reference.chapter}:${unit.reference.verse}`, statement_id: unit.statement_id, source_text: unit.source_text, classification: assessment, probability, probabilities: answer.probabilities, evidence_kind: statement.evidence_kind, record_file: record.file, case_id: caseId });
  }
}

for (const item of batch.cases) {
  const payload = item.request, fingerprint = hash(payload), rough = Math.ceil(Buffer.byteLength(JSON.stringify(payload), "utf8") / 4);
  const existing = index.attempts.find(attempt => attempt.request_fingerprint === fingerprint);
  if (existing) {
    const existingRecord = await readJson(join(recordsDirectory, existing.file), null);
    if (existingRecord) { addResultToInventory(item.local_case_id, payload, existingRecord); summaries.push({ case_id: item.local_case_id, reused_existing_record: true, ...existingRecord }); continue; }
  }
  const projectedSpent = cap.spent_input_tokens + rough;
  const record = {
    schema_version: "0.1.0", scan_kind: "representative_predictive_prophecy_discovery", case_id: item.local_case_id,
    provider_kind: "openrouter_decisions", endpoint: OPENROUTER_DECISIONS_ENDPOINT, requested_model: OPENROUTER_JEV_MODEL,
    served_model: null, provider: null, request_fingerprint: fingerprint, exact_api_request: payload,
    local_expectation: item.expected_outcome_local_only, expectation_boundary: "Local-only control expectation; excluded from exact_api_request.",
    preflight: { rough_estimated_input_tokens: rough, remaining_input_tokens_before_attempt: cap.max_input_tokens - cap.spent_input_tokens, fits_configured_cap: projectedSpent <= cap.max_input_tokens, context_limit_tokens: 32_000, exact_count_available: false },
    status: null, error: null, raw_response_text: null, raw_response: null, response_validation: null,
    usage: { input_tokens: null, output_tokens: null }, elapsed_ms: null, attempted_at: new Date().toISOString()
  };
  if (!record.preflight.fits_configured_cap || rough >= record.preflight.context_limit_tokens) {
    record.status = "failed"; record.error = "preflight_cap_or_context_limit";
  } else {
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
  }
  record.file = `${item.local_case_id}.${fingerprint}.json`;
  await writeFile(join(recordsDirectory, record.file), `${JSON.stringify(record, null, 2)}\n`);
  index.attempts.push({ case_id: item.local_case_id, request_fingerprint: fingerprint, status: record.status, file: record.file, attempted_at: record.attempted_at, served_model: record.served_model });
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  if (Number.isFinite(record.usage.input_tokens)) cap.spent_input_tokens += record.usage.input_tokens;
  addResultToInventory(item.local_case_id, payload, record); summaries.push(record);
  // No retries: one attempt is recorded, whether succeeded, failed, malformed, or interrupted.
}

const attempted = summaries.filter(item => !item.reused_existing_record);
const actualInput = attempted.reduce((sum, item) => sum + (item.usage?.input_tokens || 0), 0);
const actualOutput = attempted.reduce((sum, item) => sum + (item.usage?.output_tokens || 0), 0);
const actualWindows = attempted.filter(item => Number.isFinite(item.usage?.input_tokens) && item.status === "succeeded").length;
const perWindow = actualWindows ? actualInput / actualWindows : null;
ledger.coverage_summary = Object.fromEntries(["unprocessed", "processed", "candidate", "uncertain", "failed"].map(status => [status, ledger.verses.filter(row => row.status === status).length]));
ledger.coverage_summary.missing_or_unmapped_macula = ledger.verses.filter(row => row.macula_annotation.status !== "available").length;
ledger.coverage_summary.source_text_fallback_available = ledger.verses.filter(row => row.source_text_fallback?.status === "available_direct_coordinate").length;
ledger.coverage_summary.source_text_fallback_unavailable = ledger.coverage_summary.missing_or_unmapped_macula - ledger.coverage_summary.source_text_fallback_available;
ledger.execution_summary = { representative_batch: true, records_directory: recordsDirectory, attempted_at: new Date().toISOString(), windows_attempted: attempted.length, successful_windows: actualWindows, actual_input_tokens: actualInput, actual_output_tokens: actualOutput, actual_input_tokens_per_successful_window: perWindow, updated_corpus_input_projection: perWindow ? Math.ceil(perWindow * ledger.projection.projected_windows) : null, projection_limitation: "Extrapolated from four heterogeneous representative windows; it is not a whole-corpus tokenizer count.", failures: summaries.filter(item => item.status && item.status !== "succeeded").map(item => ({ case_id: item.case_id, status: item.status, error: item.error })) };
ledger.checkpoint = { ...ledger.checkpoint, status: "representative_batch_complete", completed_windows: ledger.checkpoint.completed_windows + actualWindows, next_window_index: 0, failed_windows: ledger.checkpoint.failed_windows + ledger.execution_summary.failures.length };
await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
await writeFile(join(recordsDirectory, "summary.json"), `${JSON.stringify({ schema_version: "0.1.0", original_spent_input_tokens: originalSpent, records: summaries.map(item => ({ case_id: item.case_id, status: item.status, file: item.file, request_fingerprint: item.request_fingerprint, usage: item.usage, elapsed_ms: item.elapsed_ms, error: item.error })), execution_summary: ledger.execution_summary }, null, 2)}\n`);
console.log(JSON.stringify(ledger.execution_summary));
