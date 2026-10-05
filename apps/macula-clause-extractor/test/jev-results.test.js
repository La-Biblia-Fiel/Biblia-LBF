import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSavedJevResults } from "../src/jev-results.js";
import { requestFingerprint } from "../src/ollama-systemone.js";

const proposition = { proposition_id: "isa_53_04_demo_p1", reference: { book: "Isaiah", chapter: 53, verse: 4 }, source: { text: "חָשַׁבְנוּ", word_ids: ["o1"] }, predicate: { word_id: "o1", text: "חָשַׁבְנוּ" }, syntax: { rule: "S-V-O" }, complements: [], participants: [], arguments: [], relations: [] };
const payload = { state: { analysis_unit: { proposition_id: proposition.proposition_id } }, questions: { assertion_status: { instructions: "Question", criteria: { asserted: "Yes", underdetermined: "No" }, evidence: { word_ids: ["o1"] } } } };

test("joins only a fingerprint-matched saved Jev judgment and keeps evidence separate", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jev-results-")), fingerprint = requestFingerprint({ ...payload, model: "typesafe/jev-1.13" }), file = "result.json";
  await writeFile(join(directory, "index.json"), JSON.stringify({ attempts: [{ proposition_id: proposition.proposition_id, requested_model: "typesafe/jev-1.13", request_fingerprint: fingerprint, status: "succeeded", file }] }));
  await writeFile(join(directory, file), JSON.stringify({ status: "succeeded", request_fingerprint: fingerprint, requested_model: "typesafe/jev-1.13", exact_api_request: payload, raw_response: { answers: { assertion_status: { choice: "asserted", probabilities: { asserted: 0.9, underdetermined: 0.1 }, confidence: 0.9 } } }, question_versions: { assertion_status: "0.3.0" } }));
  const request = { proposition_id: proposition.proposition_id, payload, local_record: { question_specification: [{ question_id: "assertion_status", evidence: { target_kind: "governing_predicate", word_ids: ["o1"] } }] } };
  const result = await loadSavedJevResults({ analysis: { propositions: [proposition] }, state: { requests: [request] }, recordsDirectory: directory });
  assert.equal(result.read_only, true); assert.equal(result.units[0].record_status, "current_saved_result");
  assert.equal(result.units[0].linguistic_evidence.predicate.word_id, "o1"); assert.equal(result.units[0].model_judgment.questions[0].explicit_target.target_kind, "governing_predicate"); assert.equal(result.units[0].model_judgment.questions[0].judgment.selected_answer, "asserted");
});
