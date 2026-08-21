import assert from "node:assert/strict";
import test from "node:test";

import {
  mapReverseLinksByTranslationPhrase,
  pendingAlignmentWorkItems
} from "../public/alignmentWorkflow.js";

test("renumbered reverse links map to the matching reference and ordinal", () => {
  const phrases = [
    { phraseIndex: 40, reference: "Revelation 14:1" },
    { phraseIndex: 41, reference: "Revelation 14:1" },
    { phraseIndex: 541, reference: "Revelation 15:1" },
    { phraseIndex: 542, reference: "Revelation 15:1" }
  ];
  const links = [
    { phraseIndex: 0, reference: "Revelation 14:1", status: "hand", units: [] },
    { phraseIndex: 1, reference: "Revelation 14:1", status: "hand", units: [] },
    { phraseIndex: 2, reference: "Revelation 15:1", status: "seeded-hand", units: [] },
    { phraseIndex: 3, reference: "Revelation 15:1", status: "seeded-hand", units: [] }
  ];

  const mapped = mapReverseLinksByTranslationPhrase(phrases, links);
  assert.equal(mapped.get(2).reference, "Revelation 15:1");
  assert.equal(mapped.get(2).phraseIndex, 2);
  assert.equal(mapped.get(2)._translationPhraseIndex, 2);
  assert.equal(mapped.get(3).phraseIndex, 3);
});

test("seeded-hand remains pending until the entire link is human-confirmed", () => {
  const mapped = new Map([
    [10, {
      phraseIndex: 4,
      _translationPhraseIndex: 10,
      reference: "Revelation 15:1",
      status: "seeded-hand",
      units: [
        { unitId: "4:0", method: "hand", sourceTokenIds: ["t1"] },
        { unitId: "4:1", method: "hand", sourceTokenIds: ["t2"] }
      ]
    }],
    [11, {
      phraseIndex: 5,
      _translationPhraseIndex: 11,
      reference: "Revelation 15:2",
      status: "hand",
      units: [{ unitId: "5:0", method: "hand", sourceTokenIds: ["t3"] }]
    }]
  ]);

  const pending = pendingAlignmentWorkItems(mapped);
  assert.deepEqual(pending.map(item => item.unit.unitId), ["4:0", "4:1"]);
  assert.ok(pending.every(item => item.phraseIndex === 10));
});
