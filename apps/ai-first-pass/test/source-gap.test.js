import test from "node:test";
import assert from "node:assert/strict";
import { attachEzraParallel, draftNehemiahGap, NEHEMIAH_GAP_BASIS } from "../src/source-gap.js";

test("Nehemiah 7:68 may be drafted only from Ezra 2:66 OSHB", () => {
  const verses = attachEzraParallel([{
    chapter: 7,
    verse: 68,
    sourceText: "",
    sourceUnavailable: true,
    sourceNote: ""
  }], [{
    chapter: 2,
    verse: 66,
    sourceText: "סוּסֵיהֶם שְׁבַע מֵאוֹת",
    morphology: "סוּסֵיהֶם | 5483 b | HNcmpc/Sp3mp",
    sourceParts: ["2:66"]
  }]);
  const gap = verses[0];
  assert.equal(gap.parallelSource.reference, "2:66");
  assert.equal(NEHEMIAH_GAP_BASIS, "ezra-2-66-oshb");

  const copied = draftNehemiahGap(gap, "  Sus caballos, setecientos treinta y seis.  ");
  assert.equal(copied.origin, "esdras-2-66-spanish");
  assert.equal(copied.spanish, "Sus caballos, setecientos treinta y seis.");

  const fromSource = draftNehemiahGap(gap, "");
  assert.equal(fromSource.origin, "esdras-2-66-source");
  assert.equal(fromSource.spanish, null);
  assert.match(fromSource.sourceText, /סוּסֵיהֶם/u);

  assert.throws(() => draftNehemiahGap({ chapter: 1, verse: 1, sourceUnavailable: true }), /only first-pass source gap/i);
});
