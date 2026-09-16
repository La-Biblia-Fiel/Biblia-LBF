import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { BOOKS, findBook } from "../src/catalog.js";
import { loadBookSource } from "../src/source-loader.js";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

test("all 66 source loaders match the canonical Protestant verse totals", async () => {
  const statusTool = await readFile(`${repoRoot}/tools/status.py`, "utf8");
  const expected = new Map(
    [...statusTool.matchAll(/^\s+"([^"]+)":\s+(\d+),$/gmu)]
      .map(match => [match[1], Number(match[2])])
  );
  assert.equal(BOOKS.length, 66);
  for (const book of BOOKS) {
    const verses = await loadBookSource(repoRoot, book);
    assert.equal(verses.length, expected.get(book.slug), book.slug);
  }
});

test("OSHB partial mappings split and merge source segments without MT labels", async () => {
  const psalms = await loadBookSource(repoRoot, findBook("salmos"));
  const psalmThree = psalms.find(verse => verse.chapter === 3 && verse.verse === 1);
  assert.deepEqual(psalmThree.sourceParts, ["3:1", "3:2"]);
  assert.match(psalmThree.sourceText, /מִזְמ֥וֹר/u);
  assert.match(psalmThree.sourceText, /יְ֭הוָה/u);

  const firstKings = await loadBookSource(repoRoot, findBook("1reyes"));
  assert.equal(firstKings.length, 816);
  assert.ok(firstKings.some(verse => verse.chapter === 22 && verse.verse === 53));
});

test("known source gap and Spanish Protestant 3 John split are explicit", async () => {
  const nehemiah = await loadBookSource(repoRoot, findBook("nehemias"));
  const gap = nehemiah.find(verse => verse.chapter === 7 && verse.verse === 68);
  assert.equal(gap.sourceUnavailable, true);
  assert.match(gap.sourceNote, /no source text/i);
  assert.equal(gap.parallelSource?.book, "esdras");
  assert.equal(gap.parallelSource?.reference, "2:66");
  assert.match(gap.parallelSource.sourceText, /סוּסֵי/u);

  const thirdJohn = await loadBookSource(repoRoot, findBook("3juan"));
  assert.equal(thirdJohn.length, 15);
  assert.match(thirdJohn.find(verse => verse.verse === 14).sourceText, /λαλήσομεν/u);
  assert.match(thirdJohn.find(verse => verse.verse === 15).sourceText, /εἰρήνῃ/u);
});
