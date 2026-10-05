import test from "node:test";
import assert from "node:assert/strict";
import { contextSettingsFromShow, requestFingerprint, serializeOllamaSystemOneDecision, validateOllamaSystemOnePayload, validateSystemOneResponse } from "../src/ollama-systemone.js";

const builderPayload = {
  state: { analysis_unit: { proposition_id: "isa_53_04_demo", complements: [{ scope: { governing_predicate_word_id: "o1" } }] }, context_additions: [], question_targets: { assertion_scope: { word_ids: ["o1"] }, relation_1: { word_ids: ["o2"] } } },
  questions: {
    assertion_scope: { type: "choice", instructions: "Assess governed material.", criteria: { thought_or_evaluation: "Governed evaluation.", underdetermined: "Not determined." } },
    relation_1: { type: "choice", instructions: "Assess the phrase.", criteria: { cause_or_reason: "Cause.", other: "Other.", underdetermined: "Not determined." } }
  }
};

test("serializes a compact configurable Ollama System One request", () => {
  const payload = serializeOllamaSystemOneDecision(builderPayload, { model: "nimble:local" });
  assert.equal(payload.model, "nimble:local");
  assert.equal(payload.state.analysis_unit.proposition_id, "isa_53_04_demo");
  assert.deepEqual(validateOllamaSystemOnePayload(payload), { ok: true, errors: [] });
  assert.equal(requestFingerprint(payload), requestFingerprint(payload));
  assert.ok(!JSON.stringify(payload).includes("response_contract"));
});

test("rejects malformed System One distributions without repairing them", () => {
  const payload = serializeOllamaSystemOneDecision(builderPayload);
  const good = { answers: {
    assertion_scope: { choice: "thought_or_evaluation", probabilities: { thought_or_evaluation: 0.9, underdetermined: 0.1 }, confidence: 0.9 },
    relation_1: { choice: "cause_or_reason", probabilities: { cause_or_reason: 0.6, other: 0.2, underdetermined: 0.2 }, confidence: 0.6 }
  } };
  assert.deepEqual(validateSystemOneResponse(good, payload), { ok: true, errors: [] });
  const bad = structuredClone(good);
  bad.answers.relation_1.probabilities.other = 2;
  assert.equal(validateSystemOneResponse(bad, payload).ok, false);
});

test("records context limits only when Ollama reports them", () => {
  assert.deepEqual(contextSettingsFromShow({ model_info: { "llama.context_length": 32768 } }), { available: true, candidates: [{ path: "model_info.llama.context_length", tokens: 32768 }], effective_tokens: 32768 });
  assert.equal(contextSettingsFromShow({ model_info: { "llama.context_length": 262144 }, parameters: "num_ctx 8194" }).effective_tokens, 8194);
  assert.deepEqual(contextSettingsFromShow({ parameters: "temperature 0.7" }), { available: false, candidates: [], effective_tokens: null });
});
