#!/usr/bin/env node
/** A fixed, resumable OT-only discovery tranche. One request per context; never retries. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { buildContextWindowRequest, buildFragmentContextWindowRequest, inventoryDisposition } from "./src/candidate-scan.js";
import { OPENROUTER_DECISIONS_ENDPOINT, OPENROUTER_JEV_MODEL } from "./src/openrouter-decisions.js";
import { extractUsage, validateSystemOneResponse } from "./src/ollama-systemone.js";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const recordsDirectory = join(appRoot, "var", "openrouter-jev-ot-discovery-tranche-v0.1.0");
const ledgerPath = join(appRoot, "var", "candidate-scan-v0.1.0", "ledger.json");
const TRANCHE_CAP_TOTAL_TOKENS = 200_000, OVERALL_CEILING_TOTAL_TOKENS = 2_000_000;
const INPUT_SAFETY_FACTOR = 1.7, OUTPUT_RESERVE_FRACTION = .5;
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const readJson = async (path, fallback) => { try { return JSON.parse(await readFile(path, "utf8")); } catch (error) { if (error.code === "ENOENT") return fallback; throw error; } };
const env = await readFile(join(appRoot, ".env"), "utf8").catch(error => error.code === "ENOENT" ? "" : Promise.reject(error));
const key = process.env.OPENROUTER_API_KEY || env.match(/^OPENROUTER_API_KEY=(.+)$/mu)?.[1]?.trim();
if (!key) throw new Error("No OPENROUTER_API_KEY found in the local .env or environment.");

// Ordered, fixed selection: reproducible narrative, poetry, and prophetic samples.
export const OT_DISCOVERY_TRANCHE_SELECTION = [
  { id: "narrative_genesis_12_1_3", genre: "narrative", window: { book: "Genesis", chapter: 12, firstVerse: 1, lastVerse: 3 } },
  { id: "poetry_psalms_2_1_3", genre: "poetry", window: { book: "Psalms", chapter: 2, firstVerse: 1, lastVerse: 3 } },
  { id: "prophetic_isaiah_5_29_to_6_2", genre: "prophetic", fragments: [{ book: "Isaiah", chapter: 5, firstVerse: 29, lastVerse: 30 }, { book: "Isaiah", chapter: 6, firstVerse: 1, lastVerse: 2 }] },
  { id: "narrative_exodus_3_1_3", genre: "narrative", window: { book: "Exodus", chapter: 3, firstVerse: 1, lastVerse: 3 } },
  { id: "poetry_psalms_110_1_3", genre: "poetry", window: { book: "Psalms", chapter: 110, firstVerse: 1, lastVerse: 3 } },
  { id: "prophetic_jeremiah_1_1_3", genre: "prophetic", window: { book: "Jeremiah", chapter: 1, firstVerse: 1, lastVerse: 3 } },
  { id: "narrative_judges_6_1_3", genre: "narrative", window: { book: "Judges", chapter: 6, firstVerse: 1, lastVerse: 3 } },
  { id: "poetry_job_19_1_3", genre: "poetry", window: { book: "Job", chapter: 19, firstVerse: 1, lastVerse: 3 } },
  { id: "prophetic_ezekiel_37_1_3", genre: "prophetic", window: { book: "Ezekiel", chapter: 37, firstVerse: 1, lastVerse: 3 } },
  { id: "narrative_1_samuel_3_1_3", genre: "narrative", window: { book: "1 Samuel", chapter: 3, firstVerse: 1, lastVerse: 3 } },
  { id: "poetry_proverbs_30_1_3", genre: "poetry", window: { book: "Proverbs", chapter: 30, firstVerse: 1, lastVerse: 3 } },
  { id: "prophetic_hosea_1_1_3", genre: "prophetic", window: { book: "Hosea", chapter: 1, firstVerse: 1, lastVerse: 3 } },
  { id: "narrative_2_samuel_7_1_3", genre: "narrative", window: { book: "2 Samuel", chapter: 7, firstVerse: 1, lastVerse: 3 } },
  { id: "poetry_lamentations_1_1_3", genre: "poetry", window: { book: "Lamentations", chapter: 1, firstVerse: 1, lastVerse: 3 } },
  { id: "prophetic_micah_4_1_3", genre: "prophetic", window: { book: "Micah", chapter: 4, firstVerse: 1, lastVerse: 3 } },
  { id: "narrative_2_kings_22_1_3", genre: "narrative", window: { book: "2 Kings", chapter: 22, firstVerse: 1, lastVerse: 3 } },
  { id: "poetry_ecclesiastes_3_1_3", genre: "poetry", window: { book: "Ecclesiastes", chapter: 3, firstVerse: 1, lastVerse: 3 } },
  { id: "prophetic_zechariah_9_1_3", genre: "prophetic", window: { book: "Zechariah", chapter: 9, firstVerse: 1, lastVerse: 3 } }
];

await mkdir(recordsDirectory, { recursive: true });
const indexPath = join(recordsDirectory, "index.json"), index = await readJson(indexPath, { schema_version: "0.1.0", attempts: [] });
const ledger = await readJson(ledgerPath, null);
if (!ledger) throw new Error("Candidate scan ledger is missing; prepare and validate it before running a tranche.");
const tranche = ledger.ot_discovery_tranche_v0_1 || { cap_total_tokens: TRANCHE_CAP_TOTAL_TOKENS, overall_ceiling_total_tokens: OVERALL_CEILING_TOTAL_TOKENS, input_safety_factor: INPUT_SAFETY_FACTOR, output_reserve_fraction: OUTPUT_RESERVE_FRACTION, status: "running", selection, attempts: [], actual_usage: { input_tokens: 0, output_tokens: 0 } };
if (tranche.status === "complete") { console.log("tranche_already_complete"); process.exit(0); }
if (tranche.cap_total_tokens !== TRANCHE_CAP_TOTAL_TOKENS || tranche.overall_ceiling_total_tokens !== OVERALL_CEILING_TOTAL_TOKENS) throw new Error("Tranche cap configuration differs from its saved checkpoint.");

function refreshCoverage() {
  ledger.coverage_summary = Object.fromEntries(["unprocessed", "processed", "candidate", "uncertain", "failed"].map(status => [status, ledger.verses.filter(row => row.status === status).length]));
  ledger.coverage_summary.missing_or_unmapped_macula = ledger.verses.filter(row => row.macula_annotation.status !== "available").length;
  ledger.coverage_summary.source_text_fallback_available = ledger.verses.filter(row => row.source_text_fallback?.status === "available_direct_coordinate").length;
  ledger.coverage_summary.source_text_fallback_unavailable = ledger.coverage_summary.missing_or_unmapped_macula - ledger.coverage_summary.source_text_fallback_available;
}
function persist() { ledger.ot_discovery_tranche_v0_1 = tranche; refreshCoverage(); return writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`); }
function recomputeVerseStatus(verse) {
  const dispositions = (verse.statements || []).map(item => item.inventory_disposition);
  verse.status = dispositions.includes("candidate") ? "candidate" : dispositions.includes("review_queue") ? "uncertain" : verse.statements?.length ? "processed" : "unprocessed";
}
function addResult(item, request, record) {
  if (record.status !== "succeeded") return;
  const byReference = new Map(ledger.verses.map(verse => [`${verse.book}:${verse.chapter}:${verse.verse}`, verse]));
  for (const unit of request.state.statements) {
    const answer = record.raw_response?.answers?.[`${unit.statement_id}:candidate_assessment`];
    if (!answer) continue;
    const verse = byReference.get(`${unit.reference.book}:${unit.reference.chapter}:${unit.reference.verse}`);
    if (!verse) continue;
    const selected = answer.probabilities?.[answer.choice] ?? null;
    const disposition = inventoryDisposition(answer);
    const statement = { statement_id: unit.statement_id, source_text: unit.source_text, source_word_ids: unit.source_word_ids, predicate: unit.predicate, governing_scope: unit.governing_scope, assessment: answer.choice, probability: selected, probabilities: answer.probabilities, evidence_kind: "ot_discovery_tranche_v0_1", record_file: record.file, tranche_window_id: item.id, inventory_disposition: disposition };
    verse.statements = verse.statements.filter(existing => !(existing.statement_id === statement.statement_id && existing.evidence_kind === statement.evidence_kind && existing.tranche_window_id === item.id));
    verse.statements.push(statement); recomputeVerseStatus(verse);
    ledger.candidates = (ledger.candidates || []).filter(existing => !(existing.statement_id === statement.statement_id && existing.evidence_kind === statement.evidence_kind && existing.tranche_window_id === item.id));
    ledger.review_queue = (ledger.review_queue || []).filter(existing => !(existing.statement_id === statement.statement_id && existing.evidence_kind === statement.evidence_kind && existing.tranche_window_id === item.id));
    const inventoryItem = { reference: verse.reference, statement_id: statement.statement_id, source_text: statement.source_text, source_word_ids: statement.source_word_ids, governing_scope: statement.governing_scope, classification: statement.assessment, probability: statement.probability, probabilities: statement.probabilities, evidence_kind: statement.evidence_kind, record_file: statement.record_file, tranche_window_id: item.id, inventory_disposition: disposition };
    if (disposition === "candidate") ledger.candidates.push(inventoryItem);
    if (disposition === "review_queue") ledger.review_queue.push({ ...inventoryItem, review_reason: "Selected category is materially uncertain: selected probability < 0.60 or strongest alternative ≥ 0.25; possible/underdetermined is always retained." });
  }
}
function reservation(roughInput) { return Math.ceil(roughInput * INPUT_SAFETY_FACTOR) + Math.ceil(roughInput * OUTPUT_RESERVE_FRACTION); }

for (const item of OT_DISCOVERY_TRANCHE_SELECTION) {
  if (tranche.status === "cap_reached") break;
  let request;
  try { request = item.fragments ? await buildFragmentContextWindowRequest(repoRoot, item.fragments) : await buildContextWindowRequest(repoRoot, item.window); }
  catch (error) {
    const failure = { window_id: item.id, genre: item.genre, status: "failed_preflight", error: error.message, attempted_at: new Date().toISOString() };
    tranche.attempts.push(failure); ledger.checkpoint.failed_windows += 1; await persist(); continue;
  }
  const fingerprint = hash(request), roughInput = Math.ceil(Buffer.byteLength(JSON.stringify(request), "utf8") / 4);
  const cached = index.attempts.find(attempt => attempt.request_fingerprint === fingerprint && attempt.requested_model === OPENROUTER_JEV_MODEL && attempt.status === "succeeded");
  if (cached) {
    const record = await readJson(join(recordsDirectory, cached.file), null);
    if (record) { addResult(item, request, record); tranche.attempts.push({ window_id: item.id, genre: item.genre, status: "reused_cached_result", file: cached.file, request_fingerprint: fingerprint }); await persist(); continue; }
  }
  if (index.attempts.some(attempt => attempt.request_fingerprint === fingerprint)) { tranche.attempts.push({ window_id: item.id, genre: item.genre, status: "prior_nonretryable_attempt", request_fingerprint: fingerprint }); await persist(); continue; }
  const used = tranche.actual_usage.input_tokens + tranche.actual_usage.output_tokens, reserve = reservation(roughInput);
  if (used + reserve > TRANCHE_CAP_TOTAL_TOKENS || used + reserve > OVERALL_CEILING_TOTAL_TOKENS) {
    tranche.status = "cap_reached"; tranche.stop = { before_window_id: item.id, used_total_tokens: used, next_window_reserved_total_tokens: reserve, tranche_cap_total_tokens: TRANCHE_CAP_TOTAL_TOKENS, reason: "Output allowance and input safety reserve would exceed the cap before sending this request." }; await persist(); break;
  }
  const record = { schema_version: "0.1.0", tranche_kind: "ot_predictive_prophecy_discovery", window_id: item.id, genre: item.genre, provider_kind: "openrouter_decisions", endpoint: OPENROUTER_DECISIONS_ENDPOINT, requested_model: OPENROUTER_JEV_MODEL, served_model: null, provider: null, request_fingerprint: fingerprint, exact_api_request: request, preflight: { rough_input_tokens: roughInput, input_safety_factor: INPUT_SAFETY_FACTOR, output_reserve_fraction: OUTPUT_RESERVE_FRACTION, reserved_total_tokens: reserve, tranche_cap_total_tokens: TRANCHE_CAP_TOTAL_TOKENS, overall_ceiling_total_tokens: OVERALL_CEILING_TOTAL_TOKENS }, status: null, error: null, raw_response_text: null, raw_response: null, response_validation: null, usage: { input_tokens: null, output_tokens: null }, elapsed_ms: null, attempted_at: new Date().toISOString() };
  const started = performance.now();
  try {
    const response = await fetch(OPENROUTER_DECISIONS_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(request), signal: AbortSignal.timeout(120_000) });
    record.elapsed_ms = Math.round(performance.now() - started); record.raw_response_text = await response.text();
    try { record.raw_response = JSON.parse(record.raw_response_text); } catch { record.raw_response = { non_json_response: record.raw_response_text }; }
    record.served_model = record.raw_response?.model ?? null; record.provider = record.raw_response?.provider ?? null; record.usage = extractUsage(record.raw_response);
    record.response_validation = response.ok ? validateSystemOneResponse(record.raw_response, request) : { ok: false, errors: [`http_${response.status}`] };
    record.status = response.ok && record.response_validation.ok ? "succeeded" : "malformed_response";
    record.error = record.status === "succeeded" ? null : response.ok ? record.response_validation.errors.join(", ") : record.raw_response_text.slice(0, 1000);
  } catch (error) { record.elapsed_ms = Math.round(performance.now() - started); record.status = error.name === "TimeoutError" ? "interrupted" : "failed"; record.error = error.message; }
  record.file = `${item.id}.${fingerprint}.json`;
  await writeFile(join(recordsDirectory, record.file), `${JSON.stringify(record, null, 2)}\n`);
  index.attempts.push({ window_id: item.id, genre: item.genre, requested_model: OPENROUTER_JEV_MODEL, request_fingerprint: fingerprint, status: record.status, file: record.file, attempted_at: record.attempted_at, served_model: record.served_model });
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  if (Number.isFinite(record.usage.input_tokens)) tranche.actual_usage.input_tokens += record.usage.input_tokens;
  if (Number.isFinite(record.usage.output_tokens)) tranche.actual_usage.output_tokens += record.usage.output_tokens;
  if (record.status === "succeeded") { addResult(item, request, record); ledger.checkpoint.completed_windows += 1; }
  else ledger.checkpoint.failed_windows += 1;
  tranche.attempts.push({ window_id: item.id, genre: item.genre, status: record.status, file: record.file, request_fingerprint: fingerprint, usage: record.usage, elapsed_ms: record.elapsed_ms, error: record.error });
  await persist();
}
if (tranche.status === "running") tranche.status = "complete";
tranche.completed_at = new Date().toISOString();
tranche.remaining_total_tokens = TRANCHE_CAP_TOTAL_TOKENS - tranche.actual_usage.input_tokens - tranche.actual_usage.output_tokens;
ledger.checkpoint.status = `ot_tranche_${tranche.status}`;
ledger.coverage_label = "Old Testament (OT) only; New Testament (NT) remains pending.";
await persist();
await writeFile(join(recordsDirectory, "summary.json"), `${JSON.stringify({ tranche, coverage_summary: ledger.coverage_summary, candidate_count: ledger.candidates.length, review_queue_count: ledger.review_queue.length }, null, 2)}\n`);
console.log(JSON.stringify({ status: tranche.status, attempts: tranche.attempts.length, actual_usage: tranche.actual_usage, remaining_total_tokens: tranche.remaining_total_tokens, coverage_summary: ledger.coverage_summary }));
