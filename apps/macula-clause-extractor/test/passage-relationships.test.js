import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { buildIsaiahPassageRelationships, validateIsaiahPassageRelationships } from "../src/passage-relationships.js";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

test("keeps Isaiah passage relationships source-linked, unassessed, and scope-safe", async () => {
  const graph = await buildIsaiahPassageRelationships(repoRoot);
  assert.deepEqual(validateIsaiahPassageRelationships(graph), { ok: true, errors: [] });
  assert.ok(graph.relationships.every(item => item.assessment_status === "unassessed" && item.connection_source_ids.length && item.governing_scope && item.uncertainty));
  assert.ok(graph.relationships.some(item => item.relationship_type === "proposed_establishes_predictive_announcement"));
  assert.ok(graph.relationships.some(item => item.relationship_type === "proposed_contributes_to_announcement"));
  assert.ok(graph.relationships.some(item => item.relationship_type === "surrounding_or_other_content"));
  assert.ok(graph.relationships.some(item => item.relationship_type === "unresolved_relationship"));
  const considered = graph.relationships.find(item => item.source.proposition_id === "isa_53_04_2305300400720080_p1");
  assert.equal(considered.relationship_type, "surrounding_or_other_content");
  assert.equal(considered.governing_scope.kind, "evaluation_scope");
  assert.ok(considered.governing_scope.governed_complements.length);
});
