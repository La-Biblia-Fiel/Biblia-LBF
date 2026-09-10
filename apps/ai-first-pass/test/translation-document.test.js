import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { readTranslationDocument, renderTranslationDocument } from "../src/translation-document.js";

test("parses existing canonical verses and renders them in Protestant order", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lbf-first-pass-test-"));
  const path = join(directory, "book.md");
  await writeFile(path, "# Libro\n\n## Capítulo 2\n\n### 2:1\n\nSegundo\n\n## Capítulo 1\n\n### 1:1\n\nPrimero\n", "utf8");
  const document = await readTranslationDocument(path);
  assert.equal(document.verses.get("1:1"), "Primero");
  assert.equal(document.verses.get("2:1"), "Segundo");
  const rendered = renderTranslationDocument({ title: "Libro", textualBasis: "Fuente" }, document.verses);
  assert.ok(rendered.indexOf("### 1:1") < rendered.indexOf("### 2:1"));
  assert.match(rendered, /Borrador de primera pasada generado por IA/u);
});
