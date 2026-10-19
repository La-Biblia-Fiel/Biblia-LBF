import test from "node:test";
import assert from "node:assert/strict";
import { buildContextWindowRequest, buildRepresentativeBatch, buildScanWindows, enforceSpendingCap, inventoryDisposition, planBoundedRun } from "../src/candidate-scan.js";

const root = new URL("../../..", import.meta.url).pathname;

test("builds bounded same-chapter scan windows and enforces caps before execution", () => {
  const verses = [{ verse_id: "23:53:4", book: "Isaiah", chapter: 53, verse: 4 }, { verse_id: "23:53:5", book: "Isaiah", chapter: 53, verse: 5 }, { verse_id: "23:54:1", book: "Isaiah", chapter: 54, verse: 1 }];
  assert.deepEqual(buildScanWindows(verses, 6).map(window => [window.chapter, window.firstVerse, window.lastVerse]), [[53, 4, 5], [54, 1, 1]]);
  assert.throws(() => enforceSpendingCap({ projected_input_tokens: 11, projected_estimated_usd: 0 }, { max_input_tokens: 10, max_estimated_usd: 1, spent_input_tokens: 0, spent_estimated_usd: 0 }));
});

test("plans a resumable subset below the token cap even when a full projection is larger", () => {
  const windows = [{ window_id: "a" }, { window_id: "b" }, { window_id: "c" }];
  const plan = planBoundedRun(windows, { projected_input_tokens: 300, projected_windows: 3 }, { max_input_tokens: 250, spent_input_tokens: 0, max_estimated_usd: 1, spent_estimated_usd: 0 }, { requested_windows: 3 });
  assert.equal(plan.status, "ready_for_bounded_resumable_run");
  assert.equal(plan.permitted_windows, 2);
  assert.equal(plan.estimated_input_tokens, 200);
  assert.match(plan.stop_rule, /Before each window/);
});

test("keeps full local context while serializing only the selected target verses", async () => {
  const request = await buildContextWindowRequest(root, { book: "Genesis", chapter: 12, firstVerse: 1, lastVerse: 3 }, { targetVerses: [2] });
  assert.equal(request.state.source_window.length, 3);
  assert.ok(request.state.statements.length > 0);
  assert.ok(request.state.statements.every(statement => statement.reference.verse === 2));
});

test("keeps the 1 Kings narrative targets identical and outside the model payload expectations", async () => {
  const repoRoot = new URL("../../..", import.meta.url).pathname;
  const batch = await buildRepresentativeBatch(repoRoot);
  const broad = batch.cases.find(item => item.local_case_id === "explicit_prediction"), isolated = batch.cases.find(item => item.local_case_id === "ordinary_narrative");
  const broadIds = broad.request.state.statements.filter(item => item.reference.verse === 1).map(item => item.statement_id).sort();
  assert.deepEqual(broadIds, isolated.request.state.statements.map(item => item.statement_id).sort());
  assert.deepEqual(Object.keys(broad.local_target_expectations).sort(), broadIds);
  assert.match(broad.request.questions[`${broadIds[0]}:candidate_assessment`].instructions, /Target only statement/);
  assert.match(broad.request.questions[`${broadIds[0]}:statement_function`].instructions, /narration introducing or reporting/u);
  assert.equal(JSON.stringify(broad.request).includes("local_target_expectations"), false);
});

test("keeps materially uncertain judgments out of the supported candidate inventory", () => {
  assert.equal(inventoryDisposition({ choice: "supported_candidate", probabilities: { supported_candidate: .59, underdetermined: .3, possible_candidate: .1 } }), "review_queue");
  assert.equal(inventoryDisposition({ choice: "possible_candidate", probabilities: { supported_candidate: .2, possible_candidate: .7, underdetermined: .1 } }), "review_queue");
  assert.equal(inventoryDisposition({ choice: "supported_candidate", probabilities: { supported_candidate: .7, underdetermined: .2, possible_candidate: .1 } }), "candidate");
});
