import { createHash } from "node:crypto";
import { loadPassage } from "./extractor.js";
import { findBookByNumber } from "./books.js";
import { serializeOpenRouterDecision, validateOpenRouterDecision } from "./openrouter-decisions.js";

export const JEV_STATE_BUILDER_VERSION = "0.3.2";
export const JEV_STATE_QUESTION_VERSION = "0.3.0";

const wordIdCore = id => String(id || "").replace(/^o/u, "");
const targetIds = value => [...String(value || "").matchAll(/\d{12}/gu)].map(match => match[0]);
const pick = (word, fields) => Object.fromEntries(fields.filter(field => word[field] !== undefined && word[field] !== null && word[field] !== "").map(field => [field, word[field]]));
const stable = value => JSON.stringify(value);
const hash = value => createHash("sha256").update(stable(value)).digest("hex");

function sourceWordMap(analysis) {
  return new Map(analysis.clauses.flatMap(clause => clause.macula.words).map(word => [word.word_id, word]));
}

function compactWords(ids, words) {
  return ids.map(id => words.get(id)).filter(Boolean).map(word => pick(word, ["word_id", "text", "lemma", "morphology", "pos", "stem", "type", "person", "gender", "number", "ref", "subj_ref", "frame"]));
}

function question(id, prompt, choices, evidence) {
  return { question_id: id, question_version: JEV_STATE_QUESTION_VERSION, prompt, answer_choices: [...choices, "underdetermined"], evidence };
}

function relationChoices(lemma) {
  return {
    "מִן": ["source_or_origin", "separation", "comparison", "cause_or_reason", "other"],
    "בְּ": ["location", "association", "means_or_instrument", "other"],
    "לְ": ["direction_or_goal", "recipient_or_beneficiary", "possession_or_relation", "other"],
    "כְּ": ["comparison", "approximation", "other"],
    "עַל": ["location_or_contact", "direction", "topic_or_concern", "other"]
  }[lemma] || ["other"];
}

function expression(wordIds, words) {
  const tokens = wordIds.map(id => words.get(id)).filter(Boolean);
  return { word_ids: tokens.map(word => word.word_id), source_text: tokens.reduce((text, word) => `${text}${text && word.pos === "suffix" ? "" : text ? " " : ""}${word.text}`, "") };
}

export function governingTarget(proposition, words) {
  return { target_kind: "governing_predicate", ...expression([proposition.predicate.word_id], words), predicate_word_id: proposition.predicate.word_id };
}

function targetLabel(target) {
  return `“${target.source_text}” (${target.word_ids.join(", ")})`;
}

function scopeQuestion(governor, complements) {
  return question("assertion_scope", `What is the assertion scope of governed complement ${complements.map(targetLabel).join("; ")} under governing predicate ${targetLabel(governor)}?`, ["direct_assertion", "reported_speech", "thought_or_evaluation", "conditional_or_hypothetical"], { target_kind: "governed_complement", governed_by: governor, complements });
}
function eventStatusQuestion(target, targetName = "governing predicate") {
  return question("event_status", `Does ${targetName} ${targetLabel(target)} describe an occurrence/process, a condition/relation, or an unresolved distinction between them?`, ["event", "state_or_relation", "event_state_ambiguous"], target);
}
function temporalQuestion(target, targetName = "governing predicate") {
  return question("temporal_orientation", `Relative to the represented speaker or narrator's discourse reference point, how is ${targetName} ${targetLabel(target)} temporally presented? The reference point used is the supplied governing discourse scope; do not infer a definite time solely from morphology.`, ["prior", "current_or_general", "subsequent", "temporally_unspecified"], { ...target, reference_point: "represented speaker or narrator discourse reference point in the supplied scope" });
}
function assertionStatusQuestion(target, targetName = "governing predicate", id = "assertion_status") {
  return question(id, `Within the supplied governing discourse scope, how is ${targetName} ${targetLabel(target)} presented?`, ["asserted", "questioned", "hypothetical"], target);
}
function prospectiveModeQuestion(target, targetName = "governing predicate", id = "prospective_mode") {
  return question(id, `Does the supplied construction present ${targetName} ${targetLabel(target)} under a prospective or modal expression? Do not infer expectation or intention merely from a cognitive predicate.`, ["intention", "expectation_or_prediction", "directive_or_obligation", "possibility_or_permission", "none_expressed", "multiple"], target);
}

function questionTemplatesFor(proposition, words) {
  const questions = [];
  const target = governingTarget(proposition, words);
  if (proposition.complements.length) {
    const complements = proposition.complements.map(item => expression(item.word_ids, words));
    questions.push(scopeQuestion(target, complements));
  }
  questions.push(assertionStatusQuestion(target));
  questions.push(prospectiveModeQuestion(target));
  questions.push(eventStatusQuestion(target));
  questions.push(temporalQuestion(target));
  for (const [index, relation] of proposition.relations.entries()) {
    if (relation.semantic_role !== null) continue;
    const phrase = expression([relation.preposition_word_id, ...relation.object.word_ids], words);
    const construction = expression([...new Set([...target.word_ids, ...phrase.word_ids])], words);
    questions.push(question(`relation_${index + 1}`, `What relationship does phrase ${targetLabel(phrase)} contribute to governing predicate ${targetLabel(target)} in construction “${construction.source_text}”?`, relationChoices(relation.preposition_lemma), { target_kind: "unresolved_relation", predicate: target, phrase, attachment: { predicate_word_id: proposition.predicate.word_id }, neighboring_source_text: construction.source_text }));
  }
  return questions;
}

function compactParticipant(participant) {
  return pick(participant, ["role", "semantic_role", "source", "status", "surface_word_id", "surface_word_ids"]);
}

function compactProposition(proposition, words) {
  return {
    proposition_id: proposition.proposition_id,
    reference: proposition.reference,
    source_words: compactWords(proposition.evidence.word_ids, words).map(word => pick(word, ["word_id", "text", "lemma", "morphology", "pos", "stem", "type", "person", "gender", "number"])),
    predicate: { word_id: proposition.predicate.word_id, voice: proposition.predicate.voice, agent: proposition.predicate.agent ?? null, semantic_role_labels: proposition.predicate.semantic_roles.map(role => role.role) },
    participants: proposition.participants.map(compactParticipant),
    arguments: proposition.arguments.map(argument => pick(argument, ["role", "argument_type", "words"])),
    relations: proposition.relations.map(relation => ({ relation_type: relation.relation_type, preposition_lemma: relation.preposition_lemma, preposition_word_id: relation.preposition_word_id, object_word_ids: relation.object.word_ids, attachment_predicate_word_id: proposition.predicate.word_id, semantic_role: relation.semantic_role ?? null })),
    complements: proposition.complements.map(complement => ({ word_ids: complement.word_ids, scope: complement.scope, predicates: complement.predicates.map(predicate => pick(predicate, ["word_id", "voice", "agent"])) })),
    grammatical_scope: { source_rule: proposition.syntax.rule, predicate_word_id: proposition.predicate.word_id, complements_governed_by_predicate: proposition.complements.map(complement => complement.scope) }
  };
}

function auditReferences(proposition) {
  const collect = value => value?.target_ids?.map(target_id => ({ source: value.source, target_id })) || [];
  const references = [
    ...proposition.participants.flatMap(item => [...collect(item.resolution), ...(item.component_references || []).flatMap(reference => collect(reference.resolution))]),
    ...proposition.arguments.flatMap(item => collect(item.resolution)),
    ...proposition.relations.flatMap(item => collect(item.object.resolution)),
    ...proposition.complements.flatMap(item => item.predicates.flatMap(predicate => collect(predicate.resolution)))
  ];
  return [...new Map(references.map(reference => [reference.target_id, reference])).values()].map(reference => ({ target_id: reference.target_id, sources: [...new Set(references.filter(candidate => candidate.target_id === reference.target_id).map(candidate => candidate.source))] }));
}

function referencesIn(proposition) {
  const values = [
    ...proposition.participants.flatMap(item => [item.resolution, ...(item.component_references || []).map(reference => reference.resolution)]),
    ...proposition.arguments.map(item => item.resolution),
    ...proposition.relations.map(item => item.object.resolution),
    ...proposition.complements.flatMap(item => item.predicates.map(predicate => predicate.resolution))
  ].filter(Boolean);
  return [...new Set(values.flatMap(reference => reference.target_ids || targetIds(reference.target)))];
}

function targetLocation(target) {
  return target.length === 12 ? { book: target.slice(0, 2), chapter: Number(target.slice(2, 5)), verse: Number(target.slice(5, 8)) } : null;
}

/** Resolves only a source clause containing an external MACULA target; no LBF or interpretation is used. */
export function createSourceContextResolver(repoRoot) {
  const cache = new Map();
  return async target => {
    const location = targetLocation(target);
    const book = location && findBookByNumber(location.book);
    if (!book) return null;
    const key = `${book.name}:${location.chapter}:${location.verse}`;
    if (!cache.has(key)) cache.set(key, loadPassage(repoRoot, { book: book.name, chapter: location.chapter, firstVerse: location.verse, lastVerse: location.verse }));
    const raw = await cache.get(key);
    const candidates = raw.clauses.filter(clause => clause.macula.words.some(word => wordIdCore(word.word_id) === target)).sort((left, right) => left.macula.words.length - right.macula.words.length);
    const clause = candidates[0];
    if (!clause) return null;
    const word = clause.macula.words.find(item => wordIdCore(item.word_id) === target);
    return { kind: "external_referent_clause", reference: `${clause.book} ${clause.chapter}:${clause.verse}`, source_word: pick(word, ["word_id", "text", "lemma", "morphology", "pos", "stem", "type"]), source_text: clause.macula.hebrew_text, source_word_ids: clause.macula.words.map(item => item.word_id), reason: "MACULA Ref/SubjRef targets a word outside the analysis unit; its smallest containing source clause supplies referential context." };
  };
}

/** Resolves a single referenced source token without importing its distant clause. */
export function createReferentResolver(repoRoot) {
  const clauseResolver = createSourceContextResolver(repoRoot);
  return async target => {
    const context = await clauseResolver(target);
    return context ? { reference: context.reference, ...context.source_word } : null;
  };
}

function nearbyTemporalContext(proposition, analysis) {
  const candidates = analysis.propositions.filter(candidate => candidate.reference.book === proposition.reference.book && candidate.reference.chapter === proposition.reference.chapter && candidate.reference.verse === proposition.reference.verse && candidate.proposition_id !== proposition.proposition_id);
  if (!candidates.length) return null;
  const index = analysis.propositions.findIndex(candidate => candidate.proposition_id === proposition.proposition_id);
  const nearby = candidates.sort((left, right) => Math.abs(analysis.propositions.findIndex(item => item.proposition_id === left.proposition_id) - index) - Math.abs(analysis.propositions.findIndex(item => item.proposition_id === right.proposition_id) - index))[0];
  return { kind: "nearby_isaiah_53_proposition", reference: nearby.reference, source_text: nearby.source.text, source_word_ids: nearby.source.word_ids, reason: "The temporal-orientation question needs immediate local literary context; the nearest distinct canonical proposition in the same Isaiah 53 verse is included." };
}

async function omittedSubjectContext(proposition, resolveReferent) {
  const targets = proposition.participants.filter(participant => participant.source === "SubjRef" && participant.resolution?.target_ids?.length === 1).flatMap(participant => participant.resolution.target_ids);
  return (await Promise.all([...new Set(targets)].map(async target => {
    const referent = await resolveReferent(target);
    return referent ? { kind: "referent_description", reference: referent.reference, source_word: pick(referent, ["word_id", "text", "lemma", "morphology", "pos", "stem", "type"]), reason: "The grammatical subject is omitted and represented through MACULA SubjRef; this source token identifies the referent without adding the distant clause text." } : null;
  }))).filter(Boolean);
}

function responseContract(request, questions) {
  return {
    schema_version: "0.1.0",
    request_id: request.request_id,
    request_fingerprint: request.request_fingerprint,
    proposition_id: request.proposition_id,
    builder_version: JEV_STATE_BUILDER_VERSION,
    model_version: null,
    judgments: questions.map(item => ({ question_id: item.question_id, question_version: item.question_version, distribution: Object.fromEntries(item.answer_choices.map(choice => [choice, null])) }))
  };
}

function controlRequest({ proposition_id, source_words, predicate, complements = [], questions, fixture_expectations }) {
  const request_id = `${proposition_id}:jev-state:${JEV_STATE_QUESTION_VERSION}`;
  const analysis_unit = {
    proposition_id,
    reference: { kind: "english_template_control" },
    source_words,
    predicate: { word_id: predicate.word_id, voice: "active", agent: null, semantic_role_labels: [] },
    participants: [{ role: "subject", semantic_role: "subject", source: "syntax", surface_word_ids: [source_words[0].word_id] }],
    arguments: [], relations: [], complements,
    grammatical_scope: { source_rule: "control", predicate_word_id: predicate.word_id, complements_governed_by_predicate: complements.map(complement => complement.scope) }
  };
  const payload = serializeOpenRouterDecision({ analysis_unit, context_additions: [], questions });
  const request_fingerprint = hash(payload);
  return {
    request_id, proposition_id, payload,
    local_record: {
      builder_version: JEV_STATE_BUILDER_VERSION, request_fingerprint,
      request_size_bytes: Buffer.byteLength(stable(payload), "utf8"), question_specification: questions,
      source_evidence: { word_ids: source_words.map(word => word.word_id) }, external_reference_targets: [],
      context_decision: { included: [], omitted_external_source_text: "English template control; no external source context." },
      fixture_expectations,
      response_contract: responseContract({ request_id, proposition_id, request_fingerprint }, questions)
    }
  };
}

const controlWords = (name, tokens) => tokens.map(([text, morphology], index) => ({ word_id: `control.${name}.${index + 1}`, text, morphology }));
const controlTarget = (name, index, text, target_kind, predicateIndex = index) => ({ target_kind, word_ids: [`control.${name}.${index}`], source_text: text, predicate_word_id: `control.${name}.${predicateIndex}` });
const complement = (target, governor, voice = "unspecified") => ({ word_ids: target.word_ids, scope: { relation: "predicate_complement", governing_predicate_word_id: governor.predicate_word_id }, predicates: [{ word_id: target.word_ids[0], voice }] });

/** Six v0.3.0 fixtures share production templates; expectations remain local audit data. */
export function buildSemanticTemplateFixtures() {
  const considered = controlWords("considered", [["We", "pronoun first plural"], ["considered", "finite verb past"], ["him", "pronoun third singular"], ["afflicted", "predicative adjective"]]);
  const cGov = controlTarget("considered", 2, "considered", "governing_predication");
  const cEmbedded = controlTarget("considered", 4, "afflicted", "governed_content", 2);
  const intended = controlWords("intended", [["We", "pronoun first plural"], ["intended", "finite verb past"], ["to afflict", "infinitival verb"], ["him", "pronoun third singular"]]);
  const iGov = controlTarget("intended", 2, "intended", "governing_predication");
  const iEmbedded = controlTarget("intended", 3, "to afflict", "embedded_predication", 2);
  const expected = controlWords("expected", [["We", "pronoun first plural"], ["expected", "finite verb past"], ["him", "pronoun third singular"], ["to arrive", "infinitival verb"]]);
  const eGov = controlTarget("expected", 2, "expected", "governing_predication");
  const eEmbedded = controlTarget("expected", 4, "to arrive", "embedded_predication", 2);
  const questioned = controlWords("questioned", [["Did", "interrogative auxiliary"], ["he", "pronoun third singular"], ["arrive", "finite verb past"]]);
  const qTarget = controlTarget("questioned", 3, "arrive", "governing_predication");
  const quoted = controlWords("quoted", [["She", "pronoun third singular"], ["said", "finite verb past"], ["He", "pronoun third singular"], ["arrived", "finite verb past"]]);
  const sGov = controlTarget("quoted", 2, "said", "governing_predication");
  const sEmbedded = controlTarget("quoted", 4, "arrived", "governed_quoted_content", 2);
  const conditional = controlWords("conditional", [["If", "conditional subordinator"], ["he", "pronoun third singular"], ["arrives", "finite verb present"], ["we", "pronoun first plural"], ["will leave", "finite verb future"]]);
  const ifTarget = controlTarget("conditional", 3, "arrives", "conditional_content");
  return [
    controlRequest({ proposition_id: "fixture_v030_considered_afflicted", source_words: considered, predicate: cGov, complements: [complement(cEmbedded, cGov)], questions: [scopeQuestion(cGov, [cEmbedded]), assertionStatusQuestion(cGov), prospectiveModeQuestion(cGov), eventStatusQuestion(cGov), temporalQuestion(cGov)], fixture_expectations: { targets: { assertion_status: cGov, prospective_mode: cGov, assertion_scope: cEmbedded }, outcomes: { assertion_status: "asserted", prospective_mode: "none_expressed", assertion_scope: "thought_or_evaluation" } } }),
    controlRequest({ proposition_id: "fixture_v030_intended_afflict", source_words: intended, predicate: iGov, complements: [complement(iEmbedded, iGov, "active")], questions: [assertionStatusQuestion(iGov, "governing predication", "assertion_status_governing"), prospectiveModeQuestion(iEmbedded, "embedded predication", "prospective_mode_embedded"), eventStatusQuestion(iGov), temporalQuestion(iGov)], fixture_expectations: { targets: { assertion_status_governing: iGov, prospective_mode_embedded: iEmbedded }, outcomes: { assertion_status_governing: "asserted", prospective_mode_embedded: "intention" } } }),
    controlRequest({ proposition_id: "fixture_v030_expected_arrive", source_words: expected, predicate: eGov, complements: [complement(eEmbedded, eGov, "active")], questions: [assertionStatusQuestion(eGov, "governing predication", "assertion_status_governing"), prospectiveModeQuestion(eEmbedded, "embedded predication", "prospective_mode_embedded"), eventStatusQuestion(eGov), temporalQuestion(eGov)], fixture_expectations: { targets: { assertion_status_governing: eGov, prospective_mode_embedded: eEmbedded }, outcomes: { assertion_status_governing: "asserted", prospective_mode_embedded: "expectation_or_prediction" } } }),
    controlRequest({ proposition_id: "fixture_v030_questioned_arrive", source_words: questioned, predicate: qTarget, questions: [assertionStatusQuestion(qTarget), prospectiveModeQuestion(qTarget), eventStatusQuestion(qTarget), temporalQuestion(qTarget)], fixture_expectations: { targets: { assertion_status: qTarget, prospective_mode: qTarget }, outcomes: { assertion_status: "questioned", prospective_mode: "none_expressed" } } }),
    controlRequest({ proposition_id: "fixture_v030_quoted_arrived", source_words: quoted, predicate: sGov, complements: [complement(sEmbedded, sGov, "active")], questions: [scopeQuestion(sGov, [sEmbedded]), assertionStatusQuestion(sEmbedded, "governed quoted content", "assertion_status_embedded"), prospectiveModeQuestion(sEmbedded, "governed quoted content", "prospective_mode_embedded"), eventStatusQuestion(sEmbedded, "governed quoted content"), temporalQuestion(sEmbedded, "governed quoted content")], fixture_expectations: { targets: { assertion_status_embedded: sEmbedded, prospective_mode_embedded: sEmbedded, assertion_scope: sEmbedded }, outcomes: { assertion_scope: "reported_speech", assertion_status_embedded: "asserted", prospective_mode_embedded: "none_expressed" } } }),
    controlRequest({ proposition_id: "fixture_v030_conditional_arrive_leave", source_words: conditional, predicate: ifTarget, questions: [scopeQuestion({ ...ifTarget, source_text: "if" }, [ifTarget]), assertionStatusQuestion(ifTarget), prospectiveModeQuestion(ifTarget), eventStatusQuestion(ifTarget), temporalQuestion(ifTarget)], fixture_expectations: { targets: { assertion_status: ifTarget, prospective_mode: ifTarget, assertion_scope: ifTarget }, outcomes: { assertion_scope: "conditional_or_hypothetical", assertion_status: "hypothetical", prospective_mode: "none_expressed" }, ambiguity: "The future leaving predication and its temporal relation are not separately queried by this conditional-arrival fixture." } })
  ];
}

/** Compatibility helper for legacy v0.2 runner paths; not used by v0.3 verification. */
export function buildSemanticTemplateControls() { return buildSemanticTemplateFixtures().slice(0, 2); }

export async function buildJevState(analysis, { resolveReferent = async () => null } = {}) {
  const words = sourceWordMap(analysis);
  const requests = [];
  for (const proposition of analysis.propositions) {
    const request_id = `${proposition.proposition_id}:jev-state:${JEV_STATE_QUESTION_VERSION}`;
    const questions = questionTemplatesFor(proposition, words);
    const context_additions = [];
    if (questions.some(question => question.question_id === "temporal_orientation")) {
      const nearby = nearbyTemporalContext(proposition, analysis);
      if (nearby) context_additions.push(nearby);
    }
    context_additions.push(...await omittedSubjectContext(proposition, resolveReferent));
    const builder_state = { analysis_unit: compactProposition(proposition, words), context_additions, questions };
    const payload = serializeOpenRouterDecision(builder_state);
    const request_fingerprint = hash(payload);
    const local_record = {
      builder_version: JEV_STATE_BUILDER_VERSION,
      request_fingerprint,
      request_size_bytes: Buffer.byteLength(stable(payload), "utf8"),
      question_specification: questions,
      source_evidence: pick(proposition.evidence, ["clause_ids", "macula_clause_nodes", "predicate_nodes", "word_ids", "resolutions"]),
      external_reference_targets: auditReferences(proposition).filter(reference => !proposition.evidence.word_ids.some(wordId => wordIdCore(wordId) === reference.target_id)),
      context_decision: { included: context_additions.map(item => ({ kind: item.kind, reason: item.reason })), omitted_external_source_text: "External target IDs remain local unless a question needs referent identification; when needed, only a source-token description is included, never the distant clause." },
      response_contract: responseContract({ request_id, proposition_id: proposition.proposition_id, request_fingerprint }, questions)
    };
    requests.push({ request_id, proposition_id: proposition.proposition_id, payload, local_record });
  }
  return { schema_version: "0.1.0", mode: "dry_run", builder_version: JEV_STATE_BUILDER_VERSION, source_analysis_schema_version: analysis.schema_version, requests, total_request_size_bytes: requests.reduce((total, request) => total + request.local_record.request_size_bytes, 0) };
}

export function validateJevState(state) {
  const errors = [];
  for (const request of state.requests) {
    const { payload, local_record } = request;
    const questions = local_record.question_specification;
    if (!Object.keys(payload.questions).length) errors.push({ request_id: request.request_id, issue: "no_questions" });
    if (payload.state.analysis_unit.complements.some(item => !item.scope?.governing_predicate_word_id)) errors.push({ request_id: request.request_id, issue: "lost_complement_scope" });
    for (const relation of payload.state.analysis_unit.relations) if (relation.semantic_role === null && !questions.some(question => question.evidence.phrase?.word_ids?.includes(relation.preposition_word_id))) errors.push({ request_id: request.request_id, issue: "unasked_unresolved_relation", word_id: relation.preposition_word_id });
    if (local_record.response_contract.request_fingerprint !== local_record.request_fingerprint) errors.push({ request_id: request.request_id, issue: "response_not_bound_to_request" });
    if (JSON.stringify(payload).match(/\bprophecy\b|\bmessianic\b|\bfulfilled\b/iu)) errors.push({ request_id: request.request_id, issue: "forbidden_interpretive_label" });
    const providerValidation = validateOpenRouterDecision(payload);
    if (!providerValidation.ok) errors.push({ request_id: request.request_id, issue: "invalid_openrouter_payload", errors: providerValidation.errors });
  }
  return { ok: errors.length === 0, errors };
}
