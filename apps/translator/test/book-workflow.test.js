import test from "node:test";
import assert from "node:assert/strict";

import {
  approveStage,
  invalidateAfterEdit,
  statusRow,
  workflowForRow
} from "../src/workflow/bookWorkflow.js";

const ledger = `# STATUS

| book | testament | translation | alignment | translation_by | translation_on | alignment_by | alignment_on | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| titus | nt | ready | ready |  |  |  |  | review |
`;

test("explicit named human approval writes only the selected ready stage", () => {
  const result = approveStage(ledger, {
    book: "titus",
    stage: "translation",
    approvedBy: "John Wry",
    approvedOn: "2026-08-20"
  });
  const row = statusRow(result.text, "titus");
  assert.equal(row.translation, "done");
  assert.equal(row.translation_by, "John Wry");
  assert.equal(row.translation_on, "2026-08-20");
  assert.equal(row.alignment, "ready");
  assert.equal(row.alignment_by, "");
});

test("approval is refused before ready and alignment waits for translation approval", () => {
  const draft = ledger.replace("| ready | ready |", "| draft | ready |");
  assert.throws(() => approveStage(draft, {
    book: "titus",
    stage: "translation",
    approvedBy: "Human",
    approvedOn: "2026-08-20"
  }), /must be ready/u);
  assert.throws(() => approveStage(ledger, {
    book: "titus",
    stage: "alignment",
    approvedBy: "Human",
    approvedOn: "2026-08-20"
  }), /Translation must be human-approved/u);
});

test("translation edits clear both bound signatures", () => {
  const signed = ledger.replace(
    "| ready | ready |  |  |  |  |",
    "| done | done | John Wry | 2026-08-20 | John Wry | 2026-08-20 |"
  );
  const result = invalidateAfterEdit(signed, { book: "titus", stage: "translation" });
  const row = statusRow(result.text, "titus");
  assert.equal(row.translation, "draft");
  assert.equal(row.alignment, "draft");
  assert.equal(row.translation_by, "");
  assert.equal(row.alignment_by, "");
});

test("alignment edits preserve translation approval and clear alignment approval", () => {
  const signed = ledger.replace(
    "| ready | ready |  |  |  |  |",
    "| done | done | John Wry | 2026-08-20 | John Wry | 2026-08-20 |"
  );
  const result = invalidateAfterEdit(signed, { book: "titus", stage: "alignment" });
  const row = statusRow(result.text, "titus");
  assert.equal(row.translation, "done");
  assert.equal(row.alignment, "draft");
  assert.equal(row.translation_by, "John Wry");
  assert.equal(workflowForRow(row).nextAction, "verify-alignment");
});
