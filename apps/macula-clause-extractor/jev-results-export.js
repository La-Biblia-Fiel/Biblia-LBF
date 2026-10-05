#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPassage } from "./src/extractor.js";
import { buildPropositions } from "./src/propositions.js";
import { buildJevState, createReferentResolver } from "./src/jev-state.js";
import { loadSavedJevResults } from "./src/jev-results.js";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const output = process.argv[2] || join(appRoot, "var", "exports", "isaiah-53-4-6-jev-results.json");
const analysis = buildPropositions(await loadPassage(repoRoot, { book: "Isaiah", chapter: 53, firstVerse: 4, lastVerse: 6 }));
const state = await buildJevState(analysis, { resolveReferent: createReferentResolver(repoRoot) });
const results = await loadSavedJevResults({ analysis, state, recordsDirectory: join(appRoot, "var", "openrouter-jev-hebrew-v0.3.0") });
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(results, null, 2)}\n`);
console.log(`${output}\n${results.units.length} joined units; no inference performed.`);
