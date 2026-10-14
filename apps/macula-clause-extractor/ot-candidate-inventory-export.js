#!/usr/bin/env node
/** Read-only export of the searchable OT candidate inventory and review queue. */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const ledger = JSON.parse(await readFile(join(appRoot, "var", "candidate-scan-v0.1.0", "ledger.json"), "utf8"));
async function files(root) {
  const entries = await readdir(root, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(join(root, entry.name)) : [join(root, entry.name)]))).flat();
}
const recordPaths = new Map((await files(join(appRoot, "var"))).filter(path => path.endsWith(".json") && !path.endsWith("ledger.json")).map(path => [path.split("/").at(-1), path]));
const records = new Map();
for (const [name, path] of recordPaths) { try { records.set(name, JSON.parse(await readFile(path, "utf8"))); } catch {} }
function references(record) {
  const state = record?.exact_api_request?.state;
  const source = state?.source_window || (state?.contexts ? Object.values(state.contexts).flatMap(context => context.source_window || []) : []);
  return source.map(item => item.reference || `${item.book} ${item.chapter}:${item.verse}`).filter(Boolean);
}
function item(row, queue) {
  const record = records.get(row.record_file);
  return { verse_reference: row.reference, statement_id: row.statement_id, statement_text: row.source_text, category: row.classification, inventory_disposition: row.inventory_disposition || (queue ? "review_queue" : "candidate"), probabilities: row.probabilities, selected_probability: row.probability, grammatical_scope: row.governing_scope || null, source_word_ids: row.source_word_ids || [], source_window_references: references(record), record_file: row.record_file || null, review_reason: row.review_reason || null };
}
const output = { schema_version: "0.1.0", label: "OT predictive-prophecy discovery inventory — model judgments, not canonical facts", coverage_label: ledger.coverage_label || "Old Testament (OT) only; New Testament (NT) remains pending.", prompt_version: ledger.scan_version, frozen_tranche: ledger.ot_discovery_tranche_v0_1?.status, candidates: ledger.candidates.map(row => item(row, false)), review_queue: ledger.review_queue.map(row => item(row, true)) };
const destination = join(appRoot, "var", "exports"); await mkdir(destination, { recursive: true });
await writeFile(join(destination, "ot-candidate-inventory-v0.1.0.json"), `${JSON.stringify(output, null, 2)}\n`);
const lines = ["# OT candidate inventory", "", output.coverage_label, "", "Model judgments remain separate from canonical evidence.", "", "## Candidates", "", "| Verse | Statement | Category | Selected probability | Scope |", "| --- | --- | --- | ---: | --- |", ...output.candidates.map(row => `| ${row.verse_reference} | ${row.statement_text} | ${row.category} | ${row.selected_probability ?? "—"} | ${row.grammatical_scope?.kind || "—"} |`), "", "## Uncertainty review queue", "", "| Verse | Statement | Category | Selected probability | Review reason |", "| --- | --- | --- | ---: | --- |", ...output.review_queue.map(row => `| ${row.verse_reference} | ${row.statement_text} | ${row.category} | ${row.selected_probability ?? "—"} | ${row.review_reason || "material uncertainty"} |`)];
await writeFile(join(destination, "ot-candidate-inventory-v0.1.0.md"), `${lines.join("\n")}\n`);
console.log(JSON.stringify({ candidates: output.candidates.length, review_queue: output.review_queue.length, json: join(destination, "ot-candidate-inventory-v0.1.0.json"), markdown: join(destination, "ot-candidate-inventory-v0.1.0.md") }));
