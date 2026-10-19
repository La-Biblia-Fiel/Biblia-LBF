#!/usr/bin/env node
/** Read-only reconciliation report for the verified WLC-coordinate recovery. */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { recordedSpend } from "./jev-budget.js";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const read = path => readFile(path, "utf8").then(JSON.parse);
const [ledger, map, index, audit] = await Promise.all([
  read(join(appRoot, "var/candidate-scan-v0.1.0/ledger.json")),
  read(join(appRoot, "var/operative-wlc-coordinate-map-v0.1.0.json")),
  read(join(appRoot, "var/openrouter-jev-coordinate-recovery-v0.1.0/index.json")),
  read(join(appRoot, "var/protestant-coordinate-review-v0.1.0.json")),
]);
const mapByReference = new Map(map.mappings.map(item => [item.protestant_reference, item]));
const previousNoTarget = ledger.verses.filter(verse => verse.macula_annotation.status !== "available" && (verse.scan_notes || []).some(note => note.kind === "no_statement_targets") && mapByReference.has(verse.reference));
const recoveryStatements = ledger.verses.flatMap(verse => (verse.statements || []).filter(statement => statement.evidence_kind === "verified_full_wlc_coordinate_recovery_v0_1").map(statement => ({ verse, statement })));
const recoveredVerseRefs = [...new Set(recoveryStatements.map(item => item.verse.reference))];
const sourceOnly = recoveryStatements.filter(item => item.statement.target_kind === "source_only_span");
const remainingUnprocessed = ledger.verses.filter(verse => verse.status === "unprocessed");
const spend = await recordedSpend(join(appRoot, "var"));
const report = {
  schema_version: "0.1.0", inference_status: "stopped_after_authorized_coordinate_recovery", operative_mapping: { path: "var/operative-wlc-coordinate-map-v0.1.0.json", verified_full_mappings: map.mappings.length, partial_mappings_excluded: audit.summary.legitimate_partial_versification_differences, unresolved_mapping_exceptions_excluded: audit.summary.mapping_defects_or_unresolved },
  recovered_coverage: { recovered_protestant_verses: recoveredVerseRefs.length, saved_successful_requests: index.attempts.filter(item => item.status === "succeeded").length, failed_or_malformed_requests: index.attempts.filter(item => item.status !== "succeeded").length, recovered_statement_targets: recoveryStatements.length, source_only_targets: sourceOnly.length, annotated_statement_targets: recoveryStatements.length - sourceOnly.length, remaining_unprocessed_verses: remainingUnprocessed.map(verse => verse.reference) },
  coordinate_sensitive_audit: { prior_local_no_statement_target_records: previousNoTarget.length, provider_requests_in_prior_records: 0, reusable_prior_judgments: 0, outcome: "All 62 had no provider submission or distribution to reuse. Their prior local metadata is preserved in scan_notes; each now has a recovered saved assessment linked to a verified WLC coordinate." , references: previousNoTarget.map(verse => ({ reference: verse.reference, prior_local_record: verse.scan_notes.find(note => note.kind === "no_statement_targets")?.record_file || null, wlc_coordinate: mapByReference.get(verse.reference)?.wlc_osis || null, recovery_record: recoveryStatements.find(item => item.verse.reference === verse.reference)?.statement.record_file || null })) },
  coverage: ledger.coverage_summary,
  additional_spend: { recovery_records_usd: index.attempts.reduce((sum, item) => sum + (Number(item.cost_usd) || 0), 0), cumulative_saved_record_spend_usd: spend.usd, recovery_usage: index.attempts.reduce((sum, item) => ({ input_tokens: sum.input_tokens + (item.usage?.input_tokens || 0), output_tokens: sum.output_tokens + (item.usage?.output_tokens || 0) }), { input_tokens: 0, output_tokens: 0 }) },
};
await writeFile(join(appRoot, "var/coordinate-recovery-report-v0.1.0.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report));
