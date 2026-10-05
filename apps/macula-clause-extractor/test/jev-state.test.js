import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { extractPassage } from "../src/extractor.js";
import { buildPropositions } from "../src/propositions.js";
import { buildJevState, buildSemanticTemplateControls, buildSemanticTemplateFixtures, createReferentResolver, governingTarget, validateJevState } from "../src/jev-state.js";
import { validateOpenRouterDecision } from "../src/openrouter-decisions.js";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const xml = await readFile(join(root, "source/hebrew/macula-hebrew-main/WLC/nodes/23-Isa-053.xml"), "utf8");
const lbf = await readFile(join(root, "translation/ot/isaias.md"), "utf8");
const analysis = (lbfMarkdown = lbf) => buildPropositions(extractPassage({ xml, lbfMarkdown, chapter: 53, firstVerse: 4, lastVerse: 6 }));
const state = () => buildJevState(analysis(), { resolveReferent: createReferentResolver(root) });

test("creates exactly one dry-run request per canonical proposition", async () => {
  const result = await state();
  assert.equal(result.requests.length, 10);
  assert.equal(new Set(result.requests.map(request => request.proposition_id)).size, 10);
  assert.ok(result.requests.every(request => request.payload.model === "typesafe/jev-1.13" && request.local_record.request_size_bytes > 0));
});
test("keeps complement scope and unresolved relations through request serialization", async () => {
  const result = await state();
  const considered = result.requests.find(request => request.proposition_id === "isa_53_04_2305300400720080_p1");
  const pierced = result.requests.find(request => request.proposition_id === "isa_53_05_2305300500120050_p1");
  assert.equal(considered.payload.state.analysis_unit.complements[0].scope.governing_predicate_word_id, "o230530040081");
  assert.ok(considered.payload.questions.assertion_scope);
  assert.equal(considered.payload.state.question_targets.assertion_scope.target_kind, "governed_complement");
  assert.equal(pierced.payload.state.analysis_unit.relations[0].semantic_role, null);
  assert.ok(pierced.local_record.question_specification.some(question => question.evidence.phrase?.word_ids.includes("o230530050031")));
});
test("preserves unresolved patient-role and possessive component reference distinctions", async () => {
  const result = await state();
  const healed = result.requests.find(request => request.proposition_id === "isa_53_05_2305300500920060_p1");
  const chastisement = result.requests.find(request => request.proposition_id === "isa_53_05_2305300500610050_p1");
  assert.equal(healed.payload.state.analysis_unit.participants[0].role, "unresolved");
  assert.ok(chastisement.local_record.source_evidence.resolutions.some(item => item.word_id === "o230530050072"));
});
test("binds independent answer distributions to the exact request and omits LBF evidence", async () => {
  const result = await state();
  const request = result.requests[0];
  assert.equal(request.local_record.response_contract.request_fingerprint, request.local_record.request_fingerprint);
  assert.ok(request.local_record.response_contract.judgments.every(judgment => "underdetermined" in judgment.distribution));
  assert.ok(!JSON.stringify(request.payload).includes("Ciertamente nuestras enfermedades"));
  assert.ok(!JSON.stringify(request.payload).includes("response_contract"));
  assert.deepEqual(validateOpenRouterDecision(request.payload), { ok: true, errors: [] });
  assert.ok(Object.values(request.payload.questions).every(question => question.type === "choice" && question.criteria.underdetermined));
  assert.ok(Object.values(request.payload.state.question_targets).every(target => target));
  const changed = await buildJevState(analysis(lbf.replace("Ciertamente nuestras enfermedades", "Spanish changed")), { resolveReferent: createReferentResolver(root) });
  assert.deepEqual(changed.requests.map(item => item.local_record.request_fingerprint), result.requests.map(item => item.local_record.request_fingerprint));
});
test("selects local temporal context and token-only referent context by evidence need", async () => {
  const result = await state();
  const carried = result.requests.find(request => request.proposition_id === "isa_53_04_2305300400610020_p1");
  const temporal = result.requests.find(request => request.proposition_id === "isa_53_06_2305300600720080_p1");
  assert.ok(carried.payload.state.context_additions.some(item => item.kind === "referent_description" && !item.source_text));
  assert.ok(temporal.payload.state.context_additions.some(item => item.kind === "nearby_isaiah_53_proposition"));
  assert.ok(result.requests.some(request => request.local_record.external_reference_targets.length));
  assert.ok(result.requests.every(request => request.local_record.context_decision.omitted_external_source_text));
  assert.deepEqual(validateJevState(result), { ok: true, errors: [] });
});
test("keeps multi-target SubjRef identities local while using nearby source context", async () => {
  const result = await state();
  const turned = result.requests.find(request => request.proposition_id === "isa_53_06_2305300600410050_p1");
  assert.ok(turned.payload.state.context_additions.some(item => item.kind === "nearby_isaiah_53_proposition" && item.source_word_ids.includes("o230530060011")));
  assert.ok(!turned.payload.state.context_additions.some(item => item.kind === "referent_description"));
  assert.deepEqual(turned.local_record.external_reference_targets.map(item => item.target_id).sort(), ["230390080041", "230520070061", "230520120141"].sort());
});

test("versions explicit predicate targets and uses the same templates for English controls", async () => {
  const result = await state();
  const considered = result.requests.find(request => request.proposition_id === "isa_53_04_2305300400720080_p1");
  const questions = considered.local_record.question_specification;
  for (const id of ["assertion_status", "prospective_mode", "event_status", "temporal_orientation"]) {
    const item = questions.find(question => question.question_id === id);
    assert.equal(item.question_version, "0.3.0");
    assert.match(item.prompt, /חֲשַׁבְנֻ/u);
    assert.deepEqual(item.evidence.word_ids, ["o230530040081"]);
  }
  assert.ok(questions.find(question => question.question_id === "assertion_scope").prompt.includes("נָג֛וּעַ"));
  assert.ok(!("morphology" in considered.payload.state.analysis_unit.predicate));
  const controls = buildSemanticTemplateControls();
  assert.equal(controls.length, 2);
  assert.ok(controls[0].payload.questions.assertion_status);
  assert.equal(controls[1].local_record.question_specification.find(question => question.question_id === "prospective_mode_embedded").evidence.target_kind, "embedded_predication");
  assert.ok(!JSON.stringify(controls).match(/expected answer|should select/iu));
  const fixtures = buildSemanticTemplateFixtures();
  assert.equal(fixtures.length, 6);
  const intended = fixtures.find(item => item.proposition_id === "fixture_v030_intended_afflict");
  assert.equal(intended.local_record.fixture_expectations.outcomes.prospective_mode_embedded, "intention");
  assert.ok(!JSON.stringify(intended.payload).includes("fixture_expectations"));
});

test("keeps semantic predicate targets on heads while surface expressions preserve attached suffixes", async () => {
  const result = await state();
  const carried = result.requests.find(request => request.proposition_id === "isa_53_04_2305300400110050_p1");
  const yhwh = result.requests.find(request => request.proposition_id === "isa_53_06_2305300600720080_p1");
  for (const request of [carried, yhwh]) for (const target of Object.values(request.payload.state.question_targets)) {
    const predicate = target.predicate || target;
    assert.deepEqual(predicate.word_ids, [predicate.predicate_word_id]);
  }
  const synthetic = governingTarget({ predicate: { word_id: "v" } }, new Map([["v", { word_id: "v", text: "verb", pos: "verb" }], ["s", { word_id: "s", text: "suffix", pos: "suffix" }]]));
  assert.deepEqual(synthetic.word_ids, ["v"]);
  assert.equal(synthetic.source_text, "verb");
  const propositions = analysis().propositions;
  const carriedThem = propositions.find(proposition => proposition.proposition_id === "isa_53_04_2305300400610020_p1");
  const consideredHim = propositions.find(proposition => proposition.proposition_id === "isa_53_04_2305300400720080_p1");
  const final = propositions.find(proposition => proposition.proposition_id === "isa_53_06_2305300600720080_p1");
  assert.deepEqual(carriedThem.predicate.surface_expression.word_ids, ["o230530040061", "o230530040062"]);
  assert.deepEqual(consideredHim.predicate.surface_expression.word_ids, ["o230530040081", "o230530040082"]);
  assert.deepEqual(final.relations[0].surface_expression.word_ids, ["o230530060091", "o230530060092"]);
  assert.deepEqual(propositions.find(proposition => proposition.proposition_id === "isa_53_04_2305300400110050_p1").predicate.surface_expression.word_ids, ["o230530040041"]);
  assert.deepEqual(final.predicate.surface_expression.word_ids, ["o230530060081"]);
});
