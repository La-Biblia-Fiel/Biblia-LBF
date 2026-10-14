#!/usr/bin/env node
/** Local-only repair for the Judges MACULA abbreviation mismatch (Jud → Jdg). */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const ledgerPath = join(appRoot, "var", "candidate-scan-v0.1.0", "ledger.json");
const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
const judges = ledger.verses.filter(item => item.book === "Judges");
const byChapter = new Map();
for (const verse of judges) { if (!byChapter.has(verse.chapter)) byChapter.set(verse.chapter, []); byChapter.get(verse.chapter).push(verse); }
let repairedAvailable = 0;
for (const [chapter, verses] of byChapter) {
  const relative = `source/hebrew/macula-hebrew-main/WLC/nodes/07-Jdg-${String(chapter).padStart(3, "0")}.xml`;
  const xml = await readFile(join(repoRoot, relative), "utf8");
  const found = new Set([...xml.matchAll(/<Sentence\b[^>]*\bverse="([^"]+)"/gu)].map(match => Number(match[1].match(/\s\d+:(\d+)$/u)?.[1])).filter(Number.isInteger));
  for (const verse of verses) {
    if (!found.has(verse.verse)) continue;
    verse.macula_annotation = { status: "available", file: relative, repaired_from: "Judges source abbreviation corrected from Jud to Jdg" };
    verse.source_text_fallback = null;
    if (verse.status === "failed" && verse.errors?.some(error => error.stage === "ot_discovery_tranche_preflight")) {
      verse.status = verse.statements?.length ? "processed" : "unprocessed";
      verse.errors = verse.errors.map(error => error.stage === "ot_discovery_tranche_preflight" ? { ...error, resolved: true, resolution: "Corrected MACULA book abbreviation; chapter file and source sentences now load locally. No inference was run." } : error);
    }
    repairedAvailable += 1;
  }
}
ledger.coverage_summary = Object.fromEntries(["unprocessed", "processed", "candidate", "uncertain", "failed"].map(status => [status, ledger.verses.filter(row => row.status === status).length]));
ledger.coverage_summary.missing_or_unmapped_macula = ledger.verses.filter(row => row.macula_annotation.status !== "available").length;
ledger.coverage_summary.source_text_fallback_available = ledger.verses.filter(row => row.source_text_fallback?.status === "available_direct_coordinate").length;
ledger.coverage_summary.source_text_fallback_unavailable = ledger.coverage_summary.missing_or_unmapped_macula - ledger.coverage_summary.source_text_fallback_available;
ledger.judges_macula_repair = { applied_at: new Date().toISOString(), corrected_code: "Jdg", repaired_available_verses: repairedAvailable, inference_calls: 0, note: "Historical failed preflight remains in the tranche record as resolved audit evidence; Judges 6:1–3 returned to unprocessed coverage for a future sequential tranche." };
await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
console.log(JSON.stringify({ repairedAvailable: repairedAvailable, coverage: ledger.coverage_summary, judges6: ledger.verses.filter(item => item.book === "Judges" && item.chapter === 6 && item.verse <= 3).map(item => ({ reference: item.reference, status: item.status, annotation: item.macula_annotation, error: item.errors?.at(-1) })) }, null, 2));
