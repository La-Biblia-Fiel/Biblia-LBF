import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { extractPassage } from "../src/extractor.js";
import { buildPropositions, validatePropositions } from "../src/propositions.js";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const xml = await readFile(join(root, "source/hebrew/macula-hebrew-main/WLC/nodes/23-Isa-053.xml"), "utf8");
const lbf = await readFile(join(root, "translation/ot/isaias.md"), "utf8");
const raw = (lbfMarkdown = lbf) => extractPassage({ xml, lbfMarkdown, chapter: 53, firstVerse: 4, lastVerse: 6 });
const output = () => buildPropositions(raw());

test("creates direct predicational units with source-language predicates", () => {
  const proposition = output().propositions.find(row => row.source_nodes[0] === "2305300500120050");
  assert.equal(proposition.predicate.text, "מְחֹלָ֣ל");
  assert.equal(proposition.predicate.predicate_type, "verbal");
  assert.equal(proposition.proposition_id, "isa_53_05_2305300500120050_p1");
});
test("classifies ClCl2 grouping as a container, not a duplicate proposition", () => {
  const result = output();
  assert.ok(result.structural_nodes.some(node => node.macula_node_id === "2305300400520040" && node.analysis_unit_type === "container"));
  assert.ok(!result.propositions.some(row => row.source_nodes[0] === "2305300400520040"));
  assert.equal(result.propositions.filter(row => row.source_nodes[0] === "2305300400610020").length, 1);
});
test("merges a referenced helper noun phrase into the sibling verbal assertion", () => {
  const proposition = output().propositions.find(row => row.predicate.word_id === "o230530040061");
  assert.deepEqual(proposition.evidence.clause_ids, ["isa53_4_2305300400610020", "isa53_4_2305300400520021", "isa53_4_2305300400520040"]);
  assert.equal(proposition.arguments.find(row => row.role === "O").resolution.target, "230530040052");
  assert.ok(proposition.source.word_ids.includes("o230530040052"));
});
test("keeps source order, participant links, and parsed semantic frames", () => {
  const proposition = output().propositions.find(row => row.source_nodes[0] === "2305300500120050");
  assert.deepEqual(proposition.source.word_ids.slice(0, 2), ["o230530050012", "o230530050021"]);
  assert.ok(proposition.participants.some(row => row.status === "referenced" && row.resolution.source === "Ref"));
  assert.deepEqual(proposition.predicate.semantic_roles, [{ role: "A1", targets: ["230530050012"] }]);
});
test("records a MACULA SubjRef as a referenced subject without naming it", () => {
  const proposition = output().propositions.find(row => row.source_nodes[0] === "2305300400610020");
  assert.deepEqual(proposition.participants[0].resolution, { source: "SubjRef", target: "230520130031", target_ids: ["230520130031"] });
  assert.equal(proposition.participants[0].status, "referenced");
});
test("preserves passive voice and does not invent an agent", () => {
  const proposition = output().propositions.find(row => row.source_nodes[0] === "2305300500120050");
  assert.equal(proposition.predicate.voice, "passive");
  assert.equal(proposition.predicate.agent, null);
  assert.equal(proposition.participants[0].semantic_role, "patient");
});
test("keeps prepositional relations unclassified", () => {
  const proposition = output().propositions.find(row => row.source_nodes[0] === "2305300500120050");
  assert.deepEqual(proposition.relations[0].semantic_role, null);
  assert.equal(proposition.relations[0].preposition_lemma, "מִן");
});
test("keeps evaluative predicate complements within their governing assertion", () => {
  const result = output();
  const proposition = result.propositions.find(row => row.source_nodes[0] === "2305300400720080");
  assert.deepEqual(proposition.complements[0].scope, { relation: "predicate_complement", governing_predicate_word_id: "o230530040081" });
  assert.equal(proposition.complements[0].predicates.length, 3);
  assert.ok(!result.propositions.some(row => ["o230530040091", "o230530040101", "o230530040122"].includes(row.predicate.word_id)));
});
test("builds the Isaiah 53:6 YHWH / hiphil / PP / object assertion", () => {
  const proposition = output().propositions.find(row => row.source_nodes[0] === "2305300600720080");
  assert.equal(proposition.predicate.lemma, "פָּגַע");
  assert.equal(proposition.predicate.stem, "hiphil");
  assert.deepEqual(proposition.participants[0].surface_word_ids, ["o230530060072"]);
  assert.equal(proposition.relations[0].object.resolution.target, "230520130031");
  assert.ok(proposition.evidence.word_ids.includes("o230530060122"));
});
test("is deterministic and independent of LBF presentation wording", () => {
  const altered = raw(lbf.replace("Ciertamente nuestras enfermedades", "Texto de presentación cambiado"));
  assert.deepEqual(output().propositions, buildPropositions(altered).propositions);
});
test("contains no theological labels and records no duplicate source node", () => {
  const result = output();
  const forbidden = /prophecy|messianic|fulfilled|future|eschatological/iu;
  assert.ok(!forbidden.test(JSON.stringify(result)));
  const ids = result.propositions.map(row => row.source_nodes[0]);
  assert.equal(new Set(ids).size, ids.length);
});
test("matches the documented proposition output shape", () => {
  const result = output();
  assert.equal(result.schema_version, "0.3.0");
  assert.equal(result.clauses.length, 12);
  for (const proposition of result.propositions) {
    for (const key of ["proposition_id", "reference", "source", "predicate", "participants", "arguments", "syntax", "source_nodes", "derivation_status", "evidence", "provenance"]) assert.ok(key in proposition);
  }
});
test("validates all source IDs and detects invalid evidence", () => {
  const result = output();
  assert.deepEqual(validatePropositions(raw(), result), { ok: true, errors: [] });
  result.propositions[0].evidence.word_ids.push("invented-word");
  assert.equal(validatePropositions(raw(), result).errors[0].issue, "unknown_word_id");
});
test("uses Niphal morphology for passive voice and preserves the healed patient", () => {
  const proposition = output().propositions.find(row => row.source_nodes[0] === "2305300500920060");
  assert.equal(proposition.predicate.voice, "passive");
  assert.equal(proposition.predicate.agent, null);
  assert.deepEqual(proposition.participants[0].surface_word_ids, ["o230530050111", "o230530050112"]);
  assert.equal(proposition.participants[0].role, "unresolved");
  assert.equal(proposition.participants[0].semantic_role, "unresolved");
});
test("represents each syntactic subject phrase as one participant", () => {
  const result = output();
  const chastisement = result.propositions.find(row => row.source_nodes[0] === "2305300500610050");
  const allOfUs = result.propositions.find(row => row.source_nodes[0] === "2305300600110060");
  assert.equal(chastisement.participants.length, 1);
  assert.deepEqual(chastisement.participants[0].surface_word_ids, ["o230530050061", "o230530050071", "o230530050072"]);
  assert.equal(allOfUs.participants.length, 1);
  assert.deepEqual(allOfUs.participants[0].surface_word_ids, ["o230530060011", "o230530060012"]);
});
test("keeps possessive Ref evidence on a phrase component, not the whole phrase identity", () => {
  const proposition = output().propositions.find(row => row.source_nodes[0] === "2305300500610050");
  const subject = proposition.participants[0];
  assert.equal(subject.resolution, null);
  assert.deepEqual(subject.component_references, [{ word_id: "o230530050072", resolution: { source: "Ref", target: "230390080041 230520070061 230520120141", target_ids: ["230390080041", "230520070061", "230520120141"] } }]);
});
test("preserves complete reference and frame target sets without selecting a first target", () => {
  const proposition = output().propositions.find(row => row.source_nodes[0] === "2305300600410050");
  assert.deepEqual(proposition.participants[0].resolution.target_ids, ["230390080041", "230520070061", "230520120141"]);
  assert.deepEqual(proposition.predicate.semantic_roles, [{ role: "A0", targets: ["230390080041", "230520070061", "230520120141"] }]);
});
test("preserves the local PP object even when its suffix refers to another expression", () => {
  const proposition = output().propositions.find(row => row.source_nodes[0] === "2305300600410050");
  assert.equal(proposition.relations[0].object.text, "דַרְכּ֖ וֹ");
  assert.deepEqual(proposition.relations[0].object.word_ids, ["o230530060052", "o230530060053"]);
  assert.equal(proposition.relations[0].object.resolution.target, "230530060041");
});
