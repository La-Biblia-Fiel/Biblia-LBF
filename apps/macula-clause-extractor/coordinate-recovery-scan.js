#!/usr/bin/env node
/**
 * Recovers Protestant targets through OSHB's verified *full* WLC mappings.
 * No partial or unresolved mapping is sent. Run without --execute for a local
 * preflight; --execute is deliberately single-pass and never retries.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { BOOKS } from "./src/books.js";
import { buildContextWindowRequest, inventoryDisposition } from "./src/candidate-scan.js";
import { OPENROUTER_DECISIONS_ENDPOINT, OPENROUTER_JEV_MODEL } from "./src/openrouter-decisions.js";
import { extractUsage, validateSystemOneResponse } from "./src/ollama-systemone.js";
import { estimatedCost, JEV_CUMULATIVE_USD_CAP, recordedSpend, acquireLock, releaseLock } from "./jev-budget.js";

const execute = process.argv.includes("--execute");
const appRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const ledgerPath = join(appRoot, "var/candidate-scan-v0.1.0/ledger.json");
const auditPath = join(appRoot, "var/protestant-coordinate-review-v0.1.0.json");
const mapPath = join(appRoot, "var/operative-wlc-coordinate-map-v0.1.0.json");
const planPath = join(appRoot, "var/coordinate-recovery-plan-v0.1.0.json");
const recordsDir = join(appRoot, "var/openrouter-jev-coordinate-recovery-v0.1.0");
const indexPath = join(recordsDir, "index.json"), lockPath = join(appRoot, "var/jev-ot-scan.lock");
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const readJson = async (path, fallback = null) => { try { return JSON.parse(await readFile(path, "utf8")); } catch (error) { if (error.code === "ENOENT") return fallback; throw error; } };
const osis = new Map([["Gen","Genesis"],["Exod","Exodus"],["Lev","Leviticus"],["Num","Numbers"],["Deut","Deuteronomy"],["Josh","Joshua"],["Judg","Judges"],["Ruth","Ruth"],["1Sam","1 Samuel"],["2Sam","2 Samuel"],["1Kgs","1 Kings"],["2Kgs","2 Kings"],["1Chr","1 Chronicles"],["2Chr","2 Chronicles"],["Ezra","Ezra"],["Neh","Nehemiah"],["Esth","Esther"],["Job","Job"],["Ps","Psalms"],["Prov","Proverbs"],["Eccl","Ecclesiastes"],["Song","Song of Songs"],["Isa","Isaiah"],["Jer","Jeremiah"],["Lam","Lamentations"],["Ezek","Ezekiel"],["Dan","Daniel"],["Hos","Hosea"],["Joel","Joel"],["Amos","Amos"],["Obad","Obadiah"],["Jonah","Jonah"],["Mic","Micah"],["Nah","Nahum"],["Hab","Habakkuk"],["Zeph","Zephaniah"],["Hag","Haggai"],["Zech","Zechariah"],["Mal","Malachi"]]);
const parseOsis = value => { const match = String(value).match(/^(.+)\.(\d+)\.(\d+)$/u); return match && { osis: match[1], chapter: Number(match[2]), verse: Number(match[3]) }; };
const audit = await readJson(auditPath), ledger = await readJson(ledgerPath);
const fullMappings = audit.chapters.flatMap(chapter => chapter.mappings).filter(mapping => mapping.classification === "legitimate_full_versification_difference");
const mapByReference = new Map(fullMappings.map(mapping => [mapping.reference, mapping]));
const operativeMap = { schema_version: "0.1.0", status: "operative_for_local_coordinate_recovery_only", authority: audit.authoritative_reference, restrictions: ["Only OSHB VerseMap entries classified full are included.", "This map preserves Protestant references and WLC source coordinates.", "It does not itself authorize syntax transfer; each recovered target validates source IDs and scope locally.", "Partial and unresolved coordinate mappings remain excluded."], mappings: fullMappings.map(mapping => ({ protestant_reference: mapping.reference, protestant_osis: mapping.kjv_coordinate, wlc_osis: mapping.wlc_coordinate, map_type: "full", source_file: mapping.source_file, source_coordinate_evidence: mapping.source_coordinate_evidence, audit_classification: mapping.classification })) };
await writeFile(mapPath, `${JSON.stringify(operativeMap, null, 2)}\n`);

const candidates = [];
for (const verse of ledger.verses) {
  if (verse.macula_annotation.status === "available") continue;
  const mapping = mapByReference.get(verse.reference); if (!mapping) continue;
  const localNoTarget = verse.status !== "unprocessed" && !(verse.statements || []).length && (verse.scan_notes || []).some(note => note.kind === "no_statement_targets");
  if (verse.status === "unprocessed" || localNoTarget) candidates.push({ verse, mapping, localNoTarget });
}
const seen = new Set();
for (const item of candidates) { const key = item.mapping.wlc_coordinate; if (seen.has(key)) throw new Error(`Duplicate recovered WLC source span: ${key}`); seen.add(key); }
const grouped = new Map();
for (const item of candidates) {
  const parsed = parseOsis(item.mapping.wlc_coordinate), book = osis.get(parsed.osis), key = `${book}:${parsed.chapter}`;
  if (!book) throw new Error(`Unknown WLC OSIS book: ${parsed.osis}`);
  grouped.set(key, [...(grouped.get(key) || []), { ...item, wlc: { book, ...parsed } }]);
}
const choiceKinds = ["candidate_assessment", "statement_function", "relationship"];
function mappedRequest(base, group) {
  const mapByWlcVerse = new Map(group.map(item => [item.wlc.verse, item]));
  const statements = base.state.statements.filter(unit => mapByWlcVerse.has(unit.reference.verse)).map(unit => {
    const item = mapByWlcVerse.get(unit.reference.verse), permanentId = `wlcmap:${item.verse.verse_id}:${unit.statement_id}`;
    return { ...unit, statement_id: permanentId, protestant_reference: { book: item.verse.book, chapter: item.verse.chapter, verse: item.verse.verse, reference: item.verse.reference, osis: item.verse.osis_reference }, wlc_reference: { osis: item.mapping.wlc_coordinate, book: unit.reference.book, chapter: unit.reference.chapter, verse: unit.reference.verse }, coordinate_map: { type: "full", authority_path: "source/hebrew/OSHB/morphhb/wlc/VerseMap.xml" } };
  });
  const source_window = base.state.source_window.map(verse => ({ ...verse, wlc_reference: verse.reference }));
  const sourceByVerse = new Map(source_window.map(verse => [verse.verse, verse]));
  const annotatedWlcVerses = new Set(statements.map(unit => unit.wlc_reference.verse));
  const sourceOnly = group.filter(item => !annotatedWlcVerses.has(item.wlc.verse)).map(item => {
    const source = sourceByVerse.get(item.wlc.verse); if (!source) throw new Error(`Mapped WLC source text unavailable: ${item.mapping.wlc_coordinate}`);
    return { statement_id: `wlcmapspan:${item.verse.verse_id}:${item.mapping.wlc_coordinate}`, target_kind: "source_only_span", source_text: source.source_text, source_word_ids: source.source_word_ids, predicate: null, governing_scope: null, protestant_reference: { book: item.verse.book, chapter: item.verse.chapter, verse: item.verse.verse, reference: item.verse.reference, osis: item.verse.osis_reference }, wlc_reference: { osis: item.mapping.wlc_coordinate, book: item.wlc.book, chapter: item.wlc.chapter, verse: item.wlc.verse, reference: source.reference }, coordinate_map: { type: "full", authority_path: "source/hebrew/OSHB/morphhb/wlc/VerseMap.xml" }, annotation_status: "structure_unavailable_at_mapped_span" };
  });
  statements.push(...sourceOnly);
  const questions = {};
  for (const unit of statements.filter(unit => unit.target_kind !== "source_only_span")) for (const kind of choiceKinds) {
    const original = Object.entries(base.questions).find(([id]) => id.endsWith(`:${kind}`) && id.includes(unit.statement_id.split(":").at(-1)) )?.[1];
    if (!original) throw new Error(`Cannot locate ${kind} criteria for recovered unit ${unit.statement_id}`);
    const id = `${unit.statement_id}:${kind}`;
    questions[id] = { type: "choice", instructions: `Assess ${kind} only for ${unit.statement_id}, whose Protestant reference is ${unit.protestant_reference.reference} and whose supplied WLC source coordinate is ${unit.wlc_reference.osis}; use the supplied governing scope and shared definitions.`, criteria: original.criteria };
  }
  const sourceOnlyCriteria = Object.entries(base.questions).find(([id]) => id.endsWith(":candidate_assessment"))?.[1]?.criteria || base.state.question_definitions?.candidate_assessment;
  for (const unit of sourceOnly) questions[`${unit.statement_id}:candidate_assessment`] = { type: "choice", instructions: `Assess possible predictive content or contribution to an announcement only for source-only span ${unit.statement_id}, whose Protestant reference is ${unit.protestant_reference.reference} and supplied WLC coordinate is ${unit.wlc_reference.osis}. Syntax, participants, and governing scope are unavailable; do not invent them.`, criteria: sourceOnlyCriteria };
  const payload = { model: base.model, state: { ...base.state, assessment_kind: "verified_full_wlc_coordinate_recovery", source_window, statements, coordinate_mapping_notice: "Each target retains both the authoritative Protestant reference and its OSHB VerseMap verified full WLC coordinate." }, questions };
  const sourceIds = new Set(source_window.flatMap(verse => verse.source_word_ids || []));
  for (const unit of statements) {
    if (!unit.source_word_ids?.length || unit.source_word_ids.some(id => !sourceIds.has(id))) throw new Error(`Recovered source IDs do not resolve inside payload: ${unit.statement_id}`);
    if (unit.target_kind !== "source_only_span" && (!unit.predicate?.word_id || !unit.source_word_ids.includes(unit.predicate.word_id))) throw new Error(`Recovered predicate source ID invalid: ${unit.statement_id}`);
  }
  if (!statements.length || !Object.keys(questions).length) throw new Error(`No recoverable statements in mapped source window ${group[0].wlc.book} ${group[0].wlc.chapter}`);
  return payload;
}
const requests = [];
for (const group of grouped.values()) {
  const first = group[0].wlc, verses = group.map(item => item.wlc.verse).sort((a, b) => a - b);
  const base = await buildContextWindowRequest(repoRoot, { book: first.book, chapter: first.chapter, firstVerse: Math.min(...verses), lastVerse: Math.max(...verses) }, { targetVerses: verses });
  const payload = mappedRequest(base, group), fingerprint = hash(payload);
  requests.push({ window_id: `wlc:${first.osis}.${first.chapter}:${Math.min(...verses)}-${Math.max(...verses)}`, wlc_book: first.book, wlc_chapter: first.chapter, protestant_references: group.map(item => item.verse.reference), target_verse_ids: group.map(item => item.verse.verse_id), source_span_ids: payload.state.statements.flatMap(statement => statement.source_word_ids), source_target_ids: payload.state.statements.map(statement => statement.statement_id), request_fingerprint: fingerprint, rough_input_tokens: Math.ceil(Buffer.byteLength(JSON.stringify(payload), "utf8") / 4), payload, local_no_target_recovered: group.filter(item => item.localNoTarget).map(item => item.verse.reference) });
}
const sourceTargetIds = requests.flatMap(item => item.source_target_ids);
const plan = { schema_version: "0.1.0", inference_status: execute ? "execute_requested" : "dry_run", operative_map: { path: "var/operative-wlc-coordinate-map-v0.1.0.json", full_mappings: fullMappings.length }, coordinate_sensitive_audit: { local_no_statement_target_records: candidates.filter(item => item.localNoTarget).map(item => ({ reference: item.verse.reference, record_file: item.verse.scan_notes.find(note => note.kind === "no_statement_targets")?.record_file || null, provider_submission: "none", reusable_judgment: false, disposition: "recovered_as_unassessed" })), existing_unprocessed_recovered: candidates.filter(item => !item.localNoTarget).map(item => item.verse.reference) }, requests: requests.map(({ payload, ...item }) => item), validation: { unique_recovered_wlc_spans: seen.size, recovered_protestant_targets: candidates.length, requests: requests.length, all_requests_have_statement_targets: requests.every(item => Object.keys(item.payload.questions).length && item.payload.state.statements.length), unique_source_target_assessments: new Set(sourceTargetIds).size === sourceTargetIds.length, note: "Word IDs may legitimately recur across distinct canonical propositions. Duplicate prevention is enforced on the mapped statement target ID, not individual word IDs." } };
await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`);
if (!execute) { console.log(JSON.stringify({ status: "dry_run_valid", recovered_targets: candidates.length, requests: requests.length, rough_input_tokens: requests.reduce((sum, request) => sum + request.rough_input_tokens, 0), coordinate_sensitive_unassessed: plan.coordinate_sensitive_audit.local_no_statement_target_records.length })); process.exit(0); }

await mkdir(recordsDir, { recursive: true }); const index = await readJson(indexPath, { schema_version: "0.1.0", attempts: [] });
const lock = await acquireLock(lockPath); if (!lock) throw new Error("overlap_prevented: shared scan lock exists");
try {
  const env = await readFile(join(appRoot, ".env"), "utf8").catch(() => ""), key = process.env.OPENROUTER_API_KEY || env.match(/^OPENROUTER_API_KEY=(.+)$/mu)?.[1]?.trim(); if (!key) throw new Error("No OPENROUTER_API_KEY found.");
  for (const request of requests) {
    const existing = index.attempts.find(item => item.request_fingerprint === request.request_fingerprint);
    if (existing?.status === "succeeded") continue;
    if (existing) throw new Error(`prior_nonretryable_attempt:${request.window_id}`);
    const spend = await recordedSpend(join(appRoot, "var")), reserve = estimatedCost({ input_tokens: Math.ceil(request.rough_input_tokens * 2.2) });
    if (spend.usd + reserve > JEV_CUMULATIVE_USD_CAP) throw new Error(`budget_reservation_exceeds_cap current=${spend.usd} reserve=${reserve} cap=${JEV_CUMULATIVE_USD_CAP}`);
    const record = { schema_version: "0.1.0", kind: "verified_full_wlc_coordinate_recovery", endpoint: OPENROUTER_DECISIONS_ENDPOINT, requested_model: OPENROUTER_JEV_MODEL, request_fingerprint: request.request_fingerprint, exact_api_request: request.payload, protestant_references: request.protestant_references, source_span_ids: request.source_span_ids, status: null, raw_response: null, raw_response_text: null, usage: { input_tokens: null, output_tokens: null }, cost_usd: null, attempted_at: new Date().toISOString() }, start = performance.now();
    try { const response = await fetch(OPENROUTER_DECISIONS_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(request.payload), signal: AbortSignal.timeout(120000) }); record.elapsed_ms = Math.round(performance.now() - start); record.raw_response_text = await response.text(); try { record.raw_response = JSON.parse(record.raw_response_text); } catch { record.raw_response = { non_json_response: record.raw_response_text }; } record.usage = extractUsage(record.raw_response); record.cost_usd = Number.isFinite(record.raw_response?.usage?.cost) ? record.raw_response.usage.cost : estimatedCost(record.usage); record.response_validation = response.ok ? validateSystemOneResponse(record.raw_response, request.payload) : { ok: false, errors: [`http_${response.status}`] }; record.status = response.ok && record.response_validation.ok ? "succeeded" : "malformed_response"; record.error = record.status === "succeeded" ? null : response.ok ? record.response_validation.errors.join(", ") : record.raw_response_text.slice(0, 1000); } catch (error) { record.elapsed_ms = Math.round(performance.now() - start); record.status = "failed"; record.error = error.message; }
    record.file = `${request.window_id.replaceAll(/[.:]/gu, "_")}.${request.request_fingerprint}.json`; await writeFile(join(recordsDir, record.file), `${JSON.stringify(record, null, 2)}\n`); index.attempts.push({ window_id: request.window_id, request_fingerprint: request.request_fingerprint, file: record.file, status: record.status, attempted_at: record.attempted_at, usage: record.usage, cost_usd: record.cost_usd }); await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
    if (record.status !== "succeeded") throw new Error(`recovery_request_${record.status}:${request.window_id}:${record.error}`);
    const byRef = new Map(ledger.verses.map(verse => [verse.reference, verse]));
    for (const unit of request.payload.state.statements) {
      const answer = record.raw_response.answers?.[`${unit.statement_id}:candidate_assessment`]; if (!answer) throw new Error(`missing_candidate_answer:${unit.statement_id}`);
      const verse = byRef.get(unit.protestant_reference.reference), disposition = inventoryDisposition(answer), statement = { statement_id: unit.statement_id, target_kind: unit.target_kind || "annotated_statement", annotation_status: unit.annotation_status || "available_via_verified_full_coordinate_mapping", source_text: unit.source_text, source_word_ids: unit.source_word_ids, predicate: unit.predicate, governing_scope: unit.governing_scope, protestant_reference: unit.protestant_reference, wlc_reference: unit.wlc_reference, coordinate_mapping: unit.coordinate_map, assessment: answer.choice, probability: answer.probabilities?.[answer.choice] ?? null, probabilities: answer.probabilities, evidence_kind: "verified_full_wlc_coordinate_recovery_v0_1", record_file: record.file, request_fingerprint: request.request_fingerprint, inventory_disposition: disposition };
      verse.statements = [...(verse.statements || []).filter(existing => existing.statement_id !== statement.statement_id), statement]; verse.coordinate_mapping = { status: "operative_full_for_recovery", protestant_osis: unit.protestant_reference.osis, wlc_osis: unit.wlc_reference.osis, authority: "source/hebrew/OSHB/morphhb/wlc/VerseMap.xml" }; verse.coordinate_recovery_audit = { status: "assessed_with_verified_full_wlc_source", record_file: record.file }; verse.status = disposition === "candidate" ? "candidate" : disposition === "review_queue" ? "uncertain" : "processed";
      for (const field of ["candidates", "review_queue"]) ledger[field] = (ledger[field] || []).filter(existing => existing.statement_id !== statement.statement_id);
      const entry = { reference: verse.reference, statement_id: statement.statement_id, target_kind: statement.target_kind, source_text: statement.source_text, source_word_ids: statement.source_word_ids, governing_scope: statement.governing_scope, classification: statement.assessment, probability: statement.probability, probabilities: statement.probabilities, evidence_kind: statement.evidence_kind, record_file: statement.record_file, request_fingerprint: statement.request_fingerprint, inventory_disposition: disposition };
      if (disposition === "candidate") ledger.candidates.push(entry); if (disposition === "review_queue") ledger.review_queue.push({ ...entry, review_reason: "Material uncertainty is retained for review." });
    }
    ledger.coverage_summary = Object.fromEntries(["unprocessed", "processed", "candidate", "uncertain", "failed"].map(status => [status, ledger.verses.filter(verse => verse.status === status).length])); await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  }
} finally { await releaseLock(lock, lockPath); }
console.log(JSON.stringify({ status: "complete", requests: requests.length, recovered_targets: candidates.length }));
