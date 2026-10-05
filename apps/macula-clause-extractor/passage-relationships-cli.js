#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildIsaiahPassageRelationships, validateIsaiahPassageRelationships } from "./src/passage-relationships.js";

const appRoot = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const output = process.argv[2] || join(appRoot, "var", "exports", "isaiah-52-13-53-12-passage-relationships.json");
const graph = await buildIsaiahPassageRelationships(repoRoot), validation = validateIsaiahPassageRelationships(graph);
if (!validation.ok) throw new Error(`Passage relationship validation failed: ${validation.errors.join(", ")}`);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify({ ...graph, validation }, null, 2)}\n`);
console.log(`${output}\n${graph.relationships.length} unassessed source-linked relationships; no inference performed.`);
