import test from "node:test";
import assert from "node:assert/strict";
import { parseTr1894, parseUtr, passageRows, tokenizeTrVerse } from "../src/tr1894-source.js";

test("TR tokenization preserves exact source reconstruction and stable IDs", () => {
  const tokens = tokenizeTrVerse("MAT.1.18", "Τοῦ δὲ ἦν. ");
  assert.deepEqual(tokens.map(token => token.token_id), ["MAT.1.18.w001", "MAT.1.18.w002", "MAT.1.18.w003"]);
  assert.equal(tokens.map(token => token.surface_source + token.after).join(""), "Τοῦ δὲ ἦν. ");
  assert.equal(tokens[2].surface_source, "ἦν");
  assert.equal(tokens[2].after, ". ");
});

test("TR and UTR readers retain Matthew verse and morphology positions", () => {
  const tr = parseTr1894("header\nx@x@MAT.1.18@Τοῦ δὲ ἦν.");
  const utr = parseUtr("1:18 tou 3588 {T-GSN} de 1161 {CONJ} hn 1510 {V-IAI-3S}");
  const rows = passageRows(tr, utr, 1, 18, 18);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].text, "Τοῦ δὲ ἦν.");
  assert.deepEqual(rows[0].utr.map(token => token.raw_tag), ["T-GSN", "CONJ", "V-IAI-3S"]);
});
