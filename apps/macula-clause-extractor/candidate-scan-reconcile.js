#!/usr/bin/env node
/** Local-only repair: reclassifies inventory/display state without modifying saved Jev responses. */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { buildRepresentativeBatch, inventoryDisposition } from "./src/candidate-scan.js";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const ledgerPath = join(appRoot, "var", "candidate-scan-v0.1.0", "ledger.json");
const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
ledger.schema_version = "0.2.0";
ledger.scan_version = "0.2.0";
const correctedBatch = await buildRepresentativeBatch(repoRoot);
const explicit = correctedBatch.cases.find(item => item.local_case_id === "explicit_prediction");
const narrative = correctedBatch.cases.find(item => item.local_case_id === "ordinary_narrative");
const expectedIds = Object.keys(explicit.local_target_expectations || {}).sort();
const actualNarrativeIds = narrative.request.state.statements.map(item => item.statement_id).sort();
if (JSON.stringify(expectedIds) !== JSON.stringify(actualNarrativeIds)) throw new Error("Local repair stopped: 1 Kings 13:1 target IDs are not identical in both contexts.");
if (JSON.stringify(correctedBatch.requests).includes("local_target_expectations") || JSON.stringify(correctedBatch.requests).includes("expected_outcome_local_only")) throw new Error("Local repair stopped: expectation leaked into model payload.");

// This local repair concerns the immutable four-window snapshot: its historical
// candidate-verse count was 8 new broad-context verses plus 3 saved Isaiah verses.
const oldCandidateVerseCount = 11;
const candidates = [], reviewQueue = [];
for (const verse of ledger.verses) {
  let hasCandidate = false, hasReview = false;
  for (const statement of verse.statements || []) {
    const forcedNarrativeReview = statement.evidence_kind === "representative_candidate_scan" && statement.case_id === "explicit_prediction" && verse.book === "1 Kings" && verse.chapter === 13 && verse.verse === 1;
    const disposition = forcedNarrativeReview ? "review_queue" : inventoryDisposition({ choice: statement.assessment, probabilities: statement.probabilities });
    statement.inventory_disposition = disposition;
    if (forcedNarrativeReview) statement.review_reason = "Narrative-separation control failed in the broader context: this target must not be qualified merely by nearby predictive content.";
    const item = { reference: verse.reference, statement_id: statement.statement_id, source_text: statement.source_text, classification: statement.assessment, probability: statement.probability, probabilities: statement.probabilities, evidence_kind: statement.evidence_kind, record_file: statement.record_file, case_id: statement.case_id, inventory_disposition: disposition };
    if (disposition === "candidate") { candidates.push(item); hasCandidate = true; }
    if (disposition === "review_queue") { reviewQueue.push({ ...item, review_reason: statement.review_reason || "The selected category (including no_support_in_supplied_context) is materially uncertain: selected < 0.60 or strongest alternative ≥ 0.25; possible/underdetermined selections are also retained for review." }); hasReview = true; }
  }
  const noStatementTargets = (verse.scan_notes || []).some(note => note.kind === "no_statement_targets");
  verse.status = hasCandidate ? "candidate" : hasReview ? "uncertain" : verse.statements?.length || noStatementTargets ? "processed" : "unprocessed";
}
ledger.candidates = candidates;
ledger.review_queue = reviewQueue;
ledger.inventory_policy = {
  candidate: "Only a supported_candidate judgment with selected probability ≥ 0.60 and strongest alternative < 0.25.",
  review_queue: "Any selected category, including no_support_in_supplied_context, with selected probability < 0.60 or strongest alternative ≥ 0.25; every possible_candidate or underdetermined judgment; and the contradictory 1 Kings 13:1 broad-context result. Review items are not labeled supported candidates."
};
ledger.representative_batch = correctedBatch;
ledger.representative_batch_outcome = {
  status: "mixed",
  prediction_detection: "passed",
  narrative_separation: "failed",
  finding: "In the broad 1 Kings 13:1–3 request, the three 13:1 narration statements were selected supported_candidate despite the isolated control selecting no_support_in_supplied_context. Saved Jev results remain unchanged; the broad-context assertions are retained in the review queue.",
  no_followup_inference: true
};
ledger.coverage_summary = Object.fromEntries(["unprocessed", "processed", "candidate", "uncertain", "failed"].map(status => [status, ledger.verses.filter(row => row.status === status).length]));
ledger.coverage_summary.missing_or_unmapped_macula = ledger.verses.filter(row => row.macula_annotation.status !== "available").length;
ledger.coverage_summary.source_text_fallback_available = ledger.verses.filter(row => row.source_text_fallback?.status === "available_direct_coordinate").length;
ledger.coverage_summary.source_text_fallback_unavailable = ledger.coverage_summary.missing_or_unmapped_macula - ledger.coverage_summary.source_text_fallback_available;
ledger.ledger_reconciliation = {
  before_local_repair: { candidate_verse_count: oldCandidateVerseCount, explanation: "The earlier count of 11 candidate verses combined eight verses selected in the representative broad-context output (1 Kings 13:1–3 and Isaiah 52:13–53:2) with three already saved Isaiah 53:4–6 verse-level results. The prior summary omitted 1 Kings 13:1 even though the broad-context response had marked it supported." },
  after_local_repair: { candidate_verse_count: ledger.coverage_summary.candidate, uncertain_verse_count: ledger.coverage_summary.uncertain, review_item_count: reviewQueue.length, explanation: "Uncertain or context-contradictory judgments are now in review_queue rather than candidate inventory; only robust supported judgments remain candidate entries." },
  target_check: { verse: "1 Kings 13:1", identical_statement_ids: expectedIds, local_expected_outcome: "no_support_in_supplied_context", checked_in_contexts: ["explicit_prediction", "ordinary_narrative"] }
};
ledger.execution_summary = { ...ledger.execution_summary, representative_batch_outcome: ledger.representative_batch_outcome.status, no_new_model_calls: true };
await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
console.log(JSON.stringify({ outcome: ledger.representative_batch_outcome, coverage: ledger.coverage_summary, reconciliation: ledger.ledger_reconciliation }, null, 2));
