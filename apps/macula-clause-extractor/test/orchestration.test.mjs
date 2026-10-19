import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatch } from "../jev-scan-orchestrator.js";

test("each route gets a turn in each round", async () => {
  const calls = [];
  const result = await dispatch({ rounds: 2, run: async route => {
    calls.push(route);
    return { status: "completed" };
  }});
  assert.equal(result.status, "checkpoint_batch_completed");
  assert.deepEqual(calls, ["annotated-ot", "nt", "ot-fallback", "annotated-ot", "nt", "ot-fallback"]);
});

test("OT exhaustion does not stop source routes", async () => {
  const calls = [];
  await dispatch({ rounds: 2, run: async route => {
    calls.push(route);
    return { status: route === "annotated-ot" ? "exhausted" : "completed" };
  }});
  assert.equal(calls.filter(route => route === "annotated-ot").length, 1);
  assert.equal(calls.filter(route => route === "nt").length, 2);
});

for (const status of ["budget_limit", "systemic_error", "overlap_prevented"]) {
  test(`stop on ${status}`, async () => {
    let calls = 0;
    const result = await dispatch({ rounds: 3, run: async () => {
      calls++;
      return { status };
    }});
    assert.equal(calls, 1);
    assert.equal(result.status, status);
  });
}

test("execution limit sends no request", async () => {
  const result = await dispatch({
    shouldStop: () => true,
    run: async () => { throw Error("must not dispatch"); },
  });
  assert.equal(result.status, "execution_limit");
});
