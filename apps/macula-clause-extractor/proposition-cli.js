#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { loadPassage } from "./src/extractor.js";
import { buildPropositions } from "./src/propositions.js";

const args = process.argv.slice(2);
const value = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const book = value("--book", "Isaiah"), chapter = Number(value("--chapter", "53")), firstVerse = Number(value("--start", "4")), lastVerse = Number(value("--end", "6"));
const root = join(fileURLToPath(new URL("..", import.meta.url)), "..");
const raw = await loadPassage(root, { book, chapter, firstVerse, lastVerse });
const output = buildPropositions(raw);
const destination = value("--output");
if (destination) await writeFile(destination, `${JSON.stringify(output, null, 2)}\n`, "utf8");
if (args.includes("--show-propositions")) {
  for (const proposition of output.propositions) console.log(`${proposition.reference.book} ${proposition.reference.chapter}:${proposition.reference.verse} [${proposition.proposition_id}]\n  ${proposition.source.text}\n  predicate: ${proposition.predicate.text} · source node: ${proposition.source_nodes[0]}`);
} else if (!destination) process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
