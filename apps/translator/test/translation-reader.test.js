import assert from "node:assert/strict";
import test from "node:test";

import { parseTranslationBook, replaceTranslationVerse } from "../src/reader/translationReader.js";

const book = `# Éxodo

## Capítulo 1

### 1:1

Texto uno.

### 1:2

Texto dos.

## Capítulo 2

### 2:1

Texto tres.
`;

test("reader parses verses without swallowing chapter headings", () => {
  assert.deepEqual(
    parseTranslationBook(book).map(({ chapter, verse, text }) => ({ chapter, verse, text })),
    [
      { chapter: 1, verse: 1, text: "Texto uno." },
      { chapter: 1, verse: 2, text: "Texto dos." },
      { chapter: 2, verse: 1, text: "Texto tres." }
    ]
  );
});

test("reader updates exactly one canonical verse and detects stale edits", () => {
  const updated = replaceTranslationVerse(book, {
    chapter: 1,
    verse: 2,
    original: "Texto dos.",
    text: "Texto corregido."
  });
  assert.match(updated, /### 1:2\n\nTexto corregido\.\n\n## Capítulo 2/u);
  assert.match(updated, /### 1:1\n\nTexto uno\./u);
  assert.throws(
    () => replaceTranslationVerse(updated, { chapter: 1, verse: 2, original: "Texto dos.", text: "Otro." }),
    /changed on disk/u
  );
});
