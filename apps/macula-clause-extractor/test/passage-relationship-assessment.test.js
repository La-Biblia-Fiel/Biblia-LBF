import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { buildIsaiahRelationshipAssessment, validateIsaiahRelationshipAssessment } from "../src/passage-relationship-assessment.js";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

test("keeps local relationship labels and expected classifications out of future Jev payloads", async () => {
  const dryRun = await buildIsaiahRelationshipAssessment(repoRoot);
  assert.deepEqual(validateIsaiahRelationshipAssessment(dryRun), { ok: true, errors: [] });
  const payload = JSON.stringify(dryRun.payload);
  assert.equal(payload.includes("proposed_local_relationship"), false);
  assert.equal(payload.includes("expected_outcomes"), false);
  assert.equal(payload.includes("expected_answer"), false);
  assert.equal(payload.includes("expected_relationship"), false);
  assert.ok(dryRun.payload.state.relationship_hypotheses.every(item => item.anchor_hypothesis !== undefined && item.relationship_id.match(/^relationship:isa_/u)));
});
