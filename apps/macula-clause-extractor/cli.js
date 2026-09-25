#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { loadIsaiahPassage } from "./src/extractor.js";

const root = join(fileURLToPath(new URL("..", import.meta.url)), "..");
const [from = "4", to = "6"] = process.argv.slice(2);
const firstVerse = Number(from);
const lastVerse = Number(to);
if (!Number.isInteger(firstVerse) || !Number.isInteger(lastVerse) || firstVerse < 1 || lastVerse < firstVerse) throw new Error("Usage: npm run extract -- <first verse> <last verse>");
process.stdout.write(`${JSON.stringify(await loadIsaiahPassage(root, firstVerse, lastVerse), null, 2)}\n`);
