#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCandidateScanLedger } from "./src/candidate-scan.js";
const appRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const directory = join(appRoot, "var", "candidate-scan-v0.1.0");
await mkdir(directory, { recursive: true });
const ledger = await buildCandidateScanLedger(repoRoot);
await writeFile(join(directory, "ledger.json"), `${JSON.stringify(ledger, null, 2)}\n`);
await writeFile(join(directory, "representative-batch.json"), `${JSON.stringify(ledger.representative_batch, null, 2)}\n`);
console.log(`${ledger.source_roster.verse_count} Protestant verses; ${ledger.candidates.length} saved-result candidates; ${ledger.projection.projected_input_tokens} rough projected input tokens; no inference performed.`);
