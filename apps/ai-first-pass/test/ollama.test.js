import test from "node:test";
import assert from "node:assert/strict";
import { validateTranslations } from "../src/ollama.js";

test("validates an exact set of model-produced verse drafts", () => {
  const result = validateTranslations([
    { reference: "1:1", spanish: " En el principio\ncreó Dios. " },
    { reference: "1:2", spanish: "Y la tierra estaba desordenada." }
  ], ["1:1", "1:2"]);
  assert.equal(result.get("1:1"), "En el principio creó Dios.");
  assert.equal(result.get("1:2"), "Y la tierra estaba desordenada.");
});

test("rejects omissions and markdown masquerading as translation", () => {
  assert.throws(
    () => validateTranslations([{ reference: "1:1", spanish: "### 1:1" }], ["1:1"]),
    /omitted or malformed/i
  );
  assert.throws(
    () => validateTranslations([{ reference: "1:1", spanish: "Texto" }], ["1:1", "1:2"]),
    /1:2/
  );
});
