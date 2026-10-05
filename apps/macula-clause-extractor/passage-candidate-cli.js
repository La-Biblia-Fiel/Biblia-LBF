#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildIsaiahCandidateAssessment, validateCandidateAssessment } from "./src/passage-candidate.js";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const output = process.argv[2] || join(appRoot, "var", "exports", "isaiah-52-13-53-12-candidate-dry-run.json");
const dryRun = await buildIsaiahCandidateAssessment(repoRoot, { recordsDirectory: join(appRoot, "var", "openrouter-jev-hebrew-v0.3.0") });
const validation = validateCandidateAssessment(dryRun);
if (!validation.ok) throw new Error(`Candidate dry-run validation failed: ${validation.errors.join(", ")}`);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify({ ...dryRun, validation }, null, 2)}\n`);
console.log(`${output}\n${dryRun.local_record.token_estimate.estimated_input_tokens} estimated input tokens; no inference performed.`);
