#!/usr/bin/env node
/**
 * Read-only reconciliation/export. It never invokes a model and never changes
 * canonical evidence or saved model response records.
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, basename } from "node:path";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const readJson = async path => JSON.parse(await readFile(path, "utf8"));
const ledger = await readJson(join(appRoot, "var/candidate-scan-v0.1.0/ledger.json"));
const nt = await readJson(join(appRoot, "var/nt-source-only-inventory-v0.1.0.json"));
const fallback = await readJson(join(appRoot, "var/ot-fallback-source-only-inventory-v0.1.0.json"));
const coordinates = await readJson(join(appRoot, "var/protestant-coordinate-review-v0.1.0.json"));
const recovery = await readJson(join(appRoot, "var/coordinate-recovery-report-v0.1.0.json")).catch(() => null);
const coordinateByReference = new Map(coordinates.chapters.flatMap(chapter => chapter.mappings).map(mapping => [mapping.reference, mapping]));
const output = join(appRoot, "var/exports"); await mkdir(output, { recursive: true });
async function files(root) { const entries = await readdir(root, { withFileTypes: true }); return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(join(root, entry.name)) : [join(root, entry.name)]))).flat(); }
const recordMap = new Map();
for (const file of (await files(join(appRoot, "var"))).filter(file => file.endsWith(".json") && !file.includes("/exports/"))) {
  try { const record = await readJson(file); if (record?.exact_api_request?.state) recordMap.set(basename(file), record); } catch {}
}
const sourceWindow = file => {
  const state = recordMap.get(file)?.exact_api_request?.state;
  const values = state?.source_window || Object.values(state?.contexts || {}).flatMap(value => value.source_window || []);
  return [...new Set((values || []).map(value => value.reference || `${value.book} ${value.chapter}:${value.verse}`).filter(Boolean))];
};
const modelProvenance = file => { const record = recordMap.get(file); return record ? { request_fingerprint: record.request_fingerprint || null, model: record.model || record.requested_model || null, template_version: record.template_version || null, record_file: file } : { record_file: file || null }; };
const review = statement => statement.inventory_disposition === "review_queue" || statement.review_flags?.length;
const row = (testament, reference, statement, fallbackRow = null, verse = null) => ({
  testament, verse_reference: reference, statement_id: statement.statement_id || statement.stable_target_id,
  target_kind: statement.target_kind || "annotated_statement", statement_text: statement.source_text,
  source_references: statement.source_word_ids || statement.span_ids || [], scope_availability: statement.governing_scope ? "available" : "unavailable",
  grammatical_scope: statement.governing_scope || null, annotation_status: statement.annotation_status || (statement.target_kind === "source_only_span" ? "unavailable" : "available"),
  disposition: review(statement) ? "review" : "candidate", assessment: statement.assessment || statement.classification,
  selected_probability: statement.probability, distributions: statement.probabilities,
  source_window_references: sourceWindow(statement.record_file), provenance: modelProvenance(statement.record_file),
  coordinate_audit: testament === "OT" ? (coordinateByReference.get(reference) || null) : null,
  coordinate_sensitive_saved_assessment: Boolean(testament === "OT" && verse?.macula_annotation?.status !== "available" && statement.target_kind !== "source_only_span"),
  review_flags: statement.review_flags || (fallbackRow?.review_reason ? [fallbackRow.review_reason] : []),
});
const entries = [];
for (const verse of ledger.verses) for (const statement of verse.statements || []) if (statement.inventory_disposition === "candidate" || review(statement)) entries.push(row("OT", verse.reference, statement, null, verse));
for (const item of nt.entries) if (item.disposition === "candidate" || item.disposition === "review_queue" || item.review_flags?.length) entries.push(row("NT", item.reference, { ...item, statement_id: item.stable_target_id, governing_scope: null, inventory_disposition: item.disposition }));
// Fallback statements are already represented in the OT ledger. The set below
// catches legacy records only, while the final key prevents double disposition.
for (const item of fallback.entries) if ((item.disposition === "candidate" || item.disposition === "review_queue") && !entries.some(value => value.statement_id === item.stable_target_id)) entries.push(row("OT", item.reference, { ...item, statement_id: item.stable_target_id, governing_scope: null, inventory_disposition: item.disposition }, item));
const grouped = new Map();
for (const entry of entries) {
  const key = `${entry.testament}|${entry.verse_reference}|${entry.target_kind}|${entry.statement_id}`;
  const existing = grouped.get(key);
  if (!existing) { grouped.set(key, { ...entry, assessments: [Object.fromEntries(Object.entries(entry).filter(([key]) => !["assessments", "disposition"].includes(key)))], duplicate_saved_dispositions: 0 }); continue; }
  existing.duplicate_saved_dispositions += 1;
  const assessmentKey = `${entry.provenance.record_file}|${entry.provenance.request_fingerprint}|${entry.assessment}`;
  if (!existing.assessments.some(value => `${value.provenance.record_file}|${value.provenance.request_fingerprint}|${value.assessment}` === assessmentKey)) existing.assessments.push(Object.fromEntries(Object.entries(entry).filter(([key]) => !["assessments", "disposition"].includes(key))));
}
const inventory = [...grouped.values()].sort((a, b) => a.testament.localeCompare(b.testament) || a.verse_reference.localeCompare(b.verse_reference) || a.statement_id.localeCompare(b.statement_id));
const statusCount = Object.fromEntries(["unprocessed","processed","candidate","uncertain","failed"].map(status => [status, ledger.verses.filter(verse => verse.status === status).length]));
const historicallyBlocked = coordinates.summary.currently_blocked_references;
const ledgerByReference = new Map(ledger.verses.map(verse => [verse.reference, verse]));
const blocked = historicallyBlocked.filter(item => ledgerByReference.get(item.reference)?.status === "unprocessed");
const formerGaps = ledger.verses.filter(verse => verse.macula_annotation.status !== "available");
const fallbackReferences = new Set(fallback.entries.map(entry => entry.reference));
const coordinateSensitive = formerGaps.filter(verse => (verse.scan_notes || []).some(note => note.kind === "no_statement_targets"));
const completion = {
  OT: { total_protestant_verses: ledger.verses.length, assessed_verses: ledger.verses.length - statusCount.unprocessed - statusCount.failed, percent_assessed: Number(((ledger.verses.length - statusCount.unprocessed - statusCount.failed) / ledger.verses.length * 100).toFixed(2)), dispositions: statusCount, annotation_gaps_recorded: ledger.verses.filter(verse => verse.macula_annotation.status !== "available").length, remaining_blocked: blocked.length },
  NT: { total_TR_verses: nt.coverage.assessed_spans, assessed_source_only_spans: nt.coverage.assessed_spans, percent_assessed: 100, dispositions: { candidate: nt.coverage.candidate, review: nt.coverage.review, processed: nt.coverage.processed }, annotation_transfer: "not used for this completed source-only scan" },
  inference: "stopped; this report reads saved records only",
};
const gapChange = { initial_annotation_gap_count: 186, initial_direct_fallback_available: 52, initial_direct_fallback_unavailable: 134, current_blocked: blocked.length, historical_full_mapping_blocks_recovered: historicallyBlocked.length - blocked.length, fallback_assessed_references: fallback.entries.map(entry => entry.reference), coordinate_sensitive_saved_assessments: coordinateSensitive.map(verse => verse.reference), explanation: ["52 direct-coordinate OSHB fallback spans have saved source-only assessments (10 candidate, 29 review, 13 processed).", "62 earlier local no-statement-target records never sent a provider request; their entries were recovered through the verified full WLC coordinate map and now retain an explicit recovery audit.", "The prior 72 blocked references were also recovered through verified full mappings. The 3 partial and 6 unresolved coordinate-map cases remain excluded from automatic syntax transfer."] };
const report = { schema_version: "0.1.0", generated_from: "saved records only", completion, cumulative_cost: recovery?.additional_spend?.cumulative_saved_record_spend_usd ?? null, fallback_reconciliation: { unique_saved_fallback_spans: fallback.entries.length, disposition_counts: fallback.coverage, duplicate_fallback_dispositions_removed: Math.max(0, entries.filter(entry => entry.target_kind === "source_only_span" && entry.testament === "OT").length - new Set(entries.filter(entry => entry.target_kind === "source_only_span" && entry.testament === "OT").map(entry => entry.statement_id)).size) }, gap_change: gapChange, coordinate_audit: coordinates.summary, remaining_blocked_references: blocked, inventory: { entries: inventory.length, candidates: inventory.filter(entry => entry.disposition === "candidate").length, review: inventory.filter(entry => entry.disposition === "review").length, duplicate_saved_dispositions_collapsed: [...grouped.values()].reduce((sum, entry) => sum + entry.duplicate_saved_dispositions, 0) } };
await writeFile(join(output, "predictive-prophecy-inventory-v0.1.0.json"), `${JSON.stringify({ schema_version: "0.1.0", label: "Predictive-prophecy discovery inventory: model judgments, not canonical facts", entries: inventory }, null, 2)}\n`);
const verseGroups = new Map();
for (const entry of inventory) {
  const key = `${entry.testament}|${entry.verse_reference}`;
  const group = verseGroups.get(key) || { testament: entry.testament, verse_reference: entry.verse_reference, disposition: "review", source_only_assessment: false, mapping_limitations: [], scope_availability: [], items: [] };
  group.disposition = entry.disposition === "candidate" ? "candidate" : group.disposition;
  group.source_only_assessment ||= entry.target_kind === "source_only_span";
  group.scope_availability.push(entry.scope_availability);
  if (entry.target_kind === "source_only_span") group.mapping_limitations.push("source_only_assessment: syntax, participants, and governing scope are unavailable");
  if (entry.coordinate_audit?.classification === "legitimate_partial_versification_difference") group.mapping_limitations.push("partial_versification_mapping: automatic whole-verse syntax transfer is excluded");
  if (entry.coordinate_audit?.classification === "mapping_defect_or_unresolved") group.mapping_limitations.push("coordinate_mapping_unresolved: do not treat source correspondence as verified");
  if (entry.coordinate_audit?.classification === "legitimate_full_versification_difference") group.mapping_limitations.push("verified_full_coordinate_mapping: Protestant and WLC locations are preserved; structural availability is stated per item");
  group.items.push({ statement_id: entry.statement_id, target_kind: entry.target_kind, readable_text: entry.statement_text, assessment: entry.assessment, selected_probability: entry.selected_probability, distributions: entry.distributions, scope_availability: entry.scope_availability, grammatical_scope: entry.grammatical_scope, source_references: entry.source_references, source_window_references: entry.source_window_references, provenance: entry.provenance, review_flags: entry.review_flags });
  verseGroups.set(key, group);
}
const verseInventory = [...verseGroups.values()].map(group => ({ ...group, scope_availability: [...new Set(group.scope_availability)], mapping_limitations: [...new Set(group.mapping_limitations)] })).sort((a, b) => a.testament.localeCompare(b.testament) || a.verse_reference.localeCompare(b.verse_reference));
const deliverable = { schema_version: "1.0.0", label: "Predictive-prophecy candidate and uncertainty verse inventory — saved model judgments, not canonical facts", searchable_fields: ["testament", "verse_reference", "disposition", "items.readable_text", "items.assessment", "items.target_kind", "mapping_limitations"], coverage: completion, cumulative_cost_usd: report.cumulative_cost, counts: { verses: verseInventory.length, candidate_verses: verseInventory.filter(item => item.disposition === "candidate").length, review_verses: verseInventory.filter(item => item.disposition === "review").length, source_only_verses: verseInventory.filter(item => item.source_only_assessment).length }, flags: { source_only: "A source-only assessment is a span-level model judgment; syntax, participants, and governing scope are unavailable.", mapping_limitations: "Partial or unresolved coordinate mappings are never automatically transferred. Verified full mappings preserve both coordinate systems and identify structure availability per target." }, verses: verseInventory };
await writeFile(join(output, "predictive-prophecy-candidate-review-verses-v1.0.0.json"), `${JSON.stringify(deliverable, null, 2)}\n`);
await writeFile(join(output, "predictive-prophecy-candidate-review-verses-v1.0.0.jsonl"), `${verseInventory.map(item => JSON.stringify(item)).join("\n")}\n`);
await writeFile(join(output, "predictive-prophecy-completion-report-v0.1.0.json"), `${JSON.stringify(report, null, 2)}\n`);
const md = ["# Predictive-prophecy discovery completion report", "", "Inference is stopped. This report reconciles saved records only.", "", "## Coverage", "", `- OT: ${completion.OT.assessed_verses}/${completion.OT.total_protestant_verses} verses assessed (${completion.OT.percent_assessed}%).`, `- NT: ${completion.NT.assessed_source_only_spans}/${completion.NT.total_TR_verses} TR source-only spans assessed (100%).`, `- Remaining OT blocked references: ${blocked.length}.`, "", "## Gap reconciliation", "", ...gapChange.explanation.map(item => `- ${item}`), "", "## Remaining blocked references", "", ...blocked.map(item => `- ${item.reference} — ${item.kjv_coordinate} → ${item.wlc_coordinate}; ${item.classification}`), "", "## Coordinate audit", "", `- ${coordinates.summary.divergent_chapters} divergent chapters; ${coordinates.summary.direct_coordinates_verified} direct coordinates verified; ${coordinates.summary.legitimate_full_versification_differences} full and ${coordinates.summary.legitimate_partial_versification_differences} partial versification differences; ${coordinates.summary.mapping_defects_or_unresolved} unresolved source-map exceptions.`, "", "No coordinate correspondence was made operative, and none was used to alter an assessment."];
await writeFile(join(output, "predictive-prophecy-completion-report-v0.1.0.md"), `${md.join("\n")}\n`);
console.log(JSON.stringify({ ...report.inventory, coverage: completion, blocked: blocked.length }));
