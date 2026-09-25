#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { loadPassage } from "./src/extractor.js";
import { buildPropositions } from "./src/propositions.js";
import { buildJevState, createReferentResolver, validateJevState } from "./src/jev-state.js";

const args = process.argv.slice(2), value = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const book = value("--book", "Isaiah"), chapter = Number(value("--chapter", "53")), firstVerse = Number(value("--start", "4")), lastVerse = Number(value("--end", "6"));
const root = join(fileURLToPath(new URL("..", import.meta.url)), "..");
const state = await buildJevState(buildPropositions(await loadPassage(root, { book, chapter, firstVerse, lastVerse })), { resolveReferent: createReferentResolver(root) });
const validation = validateJevState(state);
if (!validation.ok) throw new Error(JSON.stringify(validation.errors));
const destination = value("--output");
if (destination) await writeFile(destination, `${JSON.stringify(state, null, 2)}\n`, "utf8");
if (args.includes("--show-sizes")) for (const request of state.requests) console.log(`${request.proposition_id}\t${request.local_record.request_size_bytes} bytes\t${Object.keys(request.payload.questions).length} questions`);
else if (!destination) process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
