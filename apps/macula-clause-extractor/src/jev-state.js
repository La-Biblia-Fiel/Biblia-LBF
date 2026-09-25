import { createHash } from "node:crypto";
import { loadPassage } from "./extractor.js";
import { findBookByNumber } from "./books.js";
import { serializeOpenRouterDecision, validateOpenRouterDecision } from "./openrouter-decisions.js";

export const JEV_STATE_BUILDER_VERSION = "0.1.0";
export const JEV_STATE_QUESTION_VERSION = "0.1.0";

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

function questionsFor(proposition) {
  const questions = [];
  if (proposition.complements.length) {
    questions.push(question("assertion_scope", "What is the assertion scope of the governed complement material?", ["direct_assertion", "reported_speech", "thought_or_evaluation", "conditional_or_hypothetical"], { governing_predicate_word_id: proposition.predicate.word_id, complement_source_node_ids: proposition.complements.map(item => item.source_node_id) }));
  }
  questions.push(question("event_status", "How does the predicate present the content?", ["event", "state_or_relation", "other_content"], { predicate_word_id: proposition.predicate.word_id }));
  questions.push(question("temporal_orientation", "Relative to the passage's speaking context, how is the content temporally presented? Do not infer a definite time solely from verb form.", ["prior", "current_or_general", "subsequent", "temporally_unspecified"], { predicate_word_id: proposition.predicate.word_id }));
  questions.push(question("modality", "How is the content presented?", ["actual", "expected", "intended", "commanded", "possible", "conditional"], { predicate_word_id: proposition.predicate.word_id }));
  for (const [index, relation] of proposition.relations.entries()) {
    if (relation.semantic_role !== null) continue;
    questions.push(question(`relation_${index + 1}`, `What relationship is expressed by this unresolved ${relation.preposition_lemma || "prepositional"} phrase?`, relationChoices(relation.preposition_lemma), { preposition_word_id: relation.preposition_word_id, preposition_lemma: relation.preposition_lemma, object_word_ids: relation.object.word_ids }));
  }
  return questions;
}

function compactParticipant(participant) {
  return pick(participant, ["role", "semantic_role", "source", "status", "surface_word_id", "surface_word_ids", "text", "features"]);
}

function compactProposition(proposition, words) {
  return {
    proposition_id: proposition.proposition_id,
    reference: proposition.reference,
    source_words: compactWords(proposition.evidence.word_ids, words).map(word => pick(word, ["word_id", "text", "lemma", "morphology", "pos", "stem", "type", "person", "gender", "number"])),
    predicate: { ...pick(proposition.predicate, ["word_id", "text", "lemma", "morphology", "pos", "stem", "type", "person", "gender", "number", "voice"]), agent: proposition.predicate.agent ?? null, semantic_role_labels: proposition.predicate.semantic_roles.map(role => role.role) },
    participants: proposition.participants.map(compactParticipant),
    arguments: proposition.arguments.map(argument => pick(argument, ["role", "argument_type", "text", "source_node_id", "words"])),
    relations: proposition.relations.map(relation => ({ relation_type: relation.relation_type, preposition_lemma: relation.preposition_lemma, preposition_word_id: relation.preposition_word_id, object: pick(relation.object, ["text", "word_ids"]), semantic_role: relation.semantic_role ?? null })),
    complements: proposition.complements.map(complement => ({ ...pick(complement, ["text", "source_node_id", "word_ids", "scope"]), predicates: complement.predicates.map(predicate => pick(predicate, ["word_id", "text", "lemma", "stem", "type", "morphology", "voice", "agent"])) })),
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

export async function buildJevState(analysis, { resolveReferent = async () => null } = {}) {
  const words = sourceWordMap(analysis);
  const requests = [];
  for (const proposition of analysis.propositions) {
    const request_id = `${proposition.proposition_id}:jev-state:${JEV_STATE_QUESTION_VERSION}`;
    const questions = questionsFor(proposition);
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
    for (const relation of payload.state.analysis_unit.relations) if (relation.semantic_role === null && !questions.some(question => question.evidence.preposition_word_id === relation.preposition_word_id)) errors.push({ request_id: request.request_id, issue: "unasked_unresolved_relation", word_id: relation.preposition_word_id });
    if (local_record.response_contract.request_fingerprint !== local_record.request_fingerprint) errors.push({ request_id: request.request_id, issue: "response_not_bound_to_request" });
    if (JSON.stringify(payload).match(/\bprophecy\b|\bmessianic\b|\bfulfilled\b/iu)) errors.push({ request_id: request.request_id, issue: "forbidden_interpretive_label" });
    const providerValidation = validateOpenRouterDecision(payload);
    if (!providerValidation.ok) errors.push({ request_id: request.request_id, issue: "invalid_openrouter_payload", errors: providerValidation.errors });
  }
  return { ok: errors.length === 0, errors };
}
