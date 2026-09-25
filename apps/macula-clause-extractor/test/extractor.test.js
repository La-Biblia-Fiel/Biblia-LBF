import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { extractPassage, loadPassage, parseMaculaNodes } from "../src/extractor.js";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const xml = await readFile(join(root, "source/hebrew/macula-hebrew-main/WLC/nodes/23-Isa-053.xml"), "utf8");
const lbf = await readFile(join(root, "translation/ot/isaias.md"), "utf8");
const result = () => extractPassage({ xml, lbfMarkdown: lbf, chapter: 53, firstVerse: 4, lastVerse: 6 });

test("loads Isaiah's MACULA sentences", () => assert.ok(parseMaculaNodes(xml).some(sentence => sentence.verse === "ISA 53:4")));
test("detects requested clause nodes and preserves stated top-level IDs", () => {
  const ids = new Set(result().clauses.map(clause => clause.macula_node_id));
  for (const id of ["2305300400110050", "2305300500120050", "2305300600720080"]) assert.ok(ids.has(id));
});
test("assigns the correct verse and LBF text", () => {
  const clause = result().clauses.find(row => row.macula_node_id === "2305300500120050");
  assert.equal(clause.verse, 5);
  assert.match(clause.lbf.text, /herido/u);
});
test("retains nested clauses with their parent and depth", () => {
  const nested = result().clauses.find(row => row.parent_clause_id);
  assert.ok(nested);
  assert.equal(nested.depth, 1);
  assert.ok(result().clauses.some(row => row.clause_id === nested.parent_clause_id));
});
test("preserves ordered words, morphology, and linguistic relationships", () => {
  const clause = result().clauses.find(row => row.macula_node_id === "2305300500120050");
  assert.ok(clause.macula.words.length > 2);
  assert.equal(clause.macula.words[0].text, "הוּא֙");
  assert.ok(clause.macula.words.some(word => word.morphology));
  assert.ok(clause.macula.words.some(word => word.frame || word.ref || word.subj_ref));
});
test("is valid, deterministic JSON", () => assert.equal(JSON.stringify(result()), JSON.stringify(result())));
test("matches the documented output shape", () => {
  const output = result();
  assert.equal(output.schema_version, "0.1.0");
  for (const clause of output.clauses) {
    for (const key of ["clause_id", "macula_node_id", "lbf", "macula", "syntax", "references", "alignment", "provenance"]) assert.ok(key in clause);
  }
});
test("loads a passage through the book/chapter/range boundary", async () => {
  const output = await loadPassage(root, { book: "Isaías", chapter: 53, firstVerse: 4, lastVerse: 4 });
  assert.equal(output.passage.book, "Isaiah");
  assert.equal(output.clauses[0].provenance.lbf_source, "translation/ot/isaias.md");
});
