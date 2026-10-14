#!/usr/bin/env node
/** Local-only checkpoint repair for a preflight extraction failure; no model call. */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const ledgerPath = join(appRoot, "var", "candidate-scan-v0.1.0", "ledger.json");
const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
const failures = ledger.ot_discovery_tranche_v0_1?.attempts?.filter(item => item.status === "failed_preflight") || [];
const supportedWindows = {
  narrative_judges_6_1_3: { book: "Judges", chapter: 6, firstVerse: 1, lastVerse: 3 }
};
for (const failure of failures) {
  const window = supportedWindows[failure.window_id];
  if (!window) continue;
  for (const verse of ledger.verses.filter(item => item.book === window.book && item.chapter === window.chapter && item.verse >= window.firstVerse && item.verse <= window.lastVerse)) {
    verse.status = "failed";
    verse.errors = [...(verse.errors || []), { stage: "ot_discovery_tranche_preflight", window_id: failure.window_id, error: failure.error, note: "MACULA extraction was unavailable. The verse and any direct-coordinate source fallback remain visible; no inference was sent." }];
  }
}
ledger.coverage_summary = Object.fromEntries(["unprocessed", "processed", "candidate", "uncertain", "failed"].map(status => [status, ledger.verses.filter(row => row.status === status).length]));
ledger.coverage_summary.missing_or_unmapped_macula = ledger.verses.filter(row => row.macula_annotation.status !== "available").length;
ledger.coverage_summary.source_text_fallback_available = ledger.verses.filter(row => row.source_text_fallback?.status === "available_direct_coordinate").length;
ledger.coverage_summary.source_text_fallback_unavailable = ledger.coverage_summary.missing_or_unmapped_macula - ledger.coverage_summary.source_text_fallback_available;
await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
console.log(JSON.stringify({ repaired_failure_windows: failures.map(item => item.window_id), coverage_summary: ledger.coverage_summary }));
