import { createHash } from "node:crypto";
import { loadPassage, loadSourceVerses } from "./extractor.js";
import { buildPropositions } from "./propositions.js";
import { buildJevState, createReferentResolver } from "./jev-state.js";
import { loadSavedJevResults } from "./jev-results.js";

const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const targetChoices = ["supported_candidate", "possible_candidate", "no_support_in_supplied_context", "underdetermined"];
const functionChoices = ["retrospective_depiction", "anticipatory_announcement", "evaluation_or_testimony", "instruction_or_exhortation", "other", "underdetermined"];
const temporalChoices = ["prior", "current_or_general", "subsequent", "temporally_unspecified", "underdetermined"];
const candidateCriteria = {
  supported_candidate: "The supplied context positively supports predictive prophetic communication: the target contributes to an announcement of circumstances presented as subsequent to the communication setting, including retrospective depiction from a projected viewpoint.",
  possible_candidate: "Some supplied evidence supports that reading, but competing readings remain.",
  no_support_in_supplied_context: "The supplied context provides no positive support for that reading. This does not establish non-prophecy.",
  underdetermined: "Missing or ambiguous supplied evidence prevents distinguishing these outcomes."
};
const depictionCriteria = {
  retrospective_depiction: "The target is depicted retrospectively from the represented viewpoint.",
  prospective_depiction: "The target is depicted as subsequent from the represented viewpoint.",
  mixed_or_viewpoint_shift: "The supplied window supports more than one depiction viewpoint or a shift between them.",
  not_depiction: "The target is not presented as a depiction of circumstances.",
  underdetermined: "The supplied evidence does not distinguish the depiction mode."
};
const functionCriteria = {
  anticipatory_announcement: "The passage communicates circumstances as subsequent to its communication setting.",
  testimony_or_evaluation: "The passage primarily communicates testimony, evaluation, or interpretation.",
  instruction_or_exhortation: "The passage primarily communicates instruction, command, or exhortation.",
  other_communicative_function: "Another function is supported by the supplied context.",
  underdetermined: "The supplied evidence does not distinguish the communicative function."
};
const temporalCriteria = {
  prior: "The event is presented as prior to the named reference point.",
  current_or_general: "The event is presented as current at, or general relative to, the named reference point.",
  subsequent: "The event is presented as subsequent to the named reference point.",
  temporally_unspecified: "No temporal placement is expressed relative to the named reference point.",
  underdetermined: "The supplied evidence does not distinguish the temporal relation."
};

function compactTarget(proposition) {
  return {
    proposition_id: proposition.proposition_id,
    reference: proposition.reference,
    source_expression: { word_ids: proposition.source.word_ids },
    predicate: {
      predicate_word_id: proposition.predicate.word_id,
      predicate_head: proposition.predicate.text,
      surface_expression: proposition.predicate.surface_expression,
      voice: proposition.predicate.voice
    },
    grammatical_scope: {
      source_rule: proposition.syntax.rule,
      governed_complements: proposition.complements.map(item => ({ word_ids: item.word_ids, source_text: item.text, scope: item.scope, predicates: item.predicates.map(predicate => ({ word_id: predicate.word_id, voice: predicate.voice })) }))
    },
    unresolved_relations: proposition.relations.filter(relation => relation.semantic_role === null).map(relation => ({ preposition_word_id: relation.preposition_word_id, preposition_lemma: relation.preposition_lemma, surface_expression: relation.surface_expression, object_word_ids: relation.object.word_ids }))
  };
}

function compactSemanticJudgment(unit) {
  return {
    proposition_id: unit.proposition_id,
    request_fingerprint: unit.saved_request_fingerprint,
    answers: (unit.model_judgment?.questions || []).map(question => {
      const probabilities = question.judgment?.probabilities || {};
      const ranked = Object.entries(probabilities).sort(([, left], [, right]) => right - left);
      const leading = ranked[0] || [null, null];
      const alternative = ranked.find(([choice]) => choice !== leading[0]) || [null, null];
      return { question_id: question.question_id, selected_answer: question.judgment?.selected_answer ?? null, leading_probability: leading[1], strongest_alternative: { answer: alternative[0], probability: alternative[1] } };
    })
  };
}

function questionsFor(target) {
  const ask = (suffix, instructions, definitionKey, definitions) => [
    `${target.proposition_id}:${suffix}`,
    { type: "choice", instructions: `Target ${target.proposition_id}. ${instructions} Exact source IDs and governing scope are in state.assessment_targets. Answer definitions are in state.question_definitions.${definitionKey}.`, criteria: Object.fromEntries(Object.keys(definitions).map(choice => [choice, `See state.question_definitions.${definitionKey}.${choice}.`])) }
  ];
  return [
    ask("candidate_assessment", "Assess predictive prophetic communication. This is preliminary, not a theological classification. Do not use absent local modal marking as contrary evidence.", "candidate_assessment", candidateCriteria),
    ask("depiction_mode", "Assess depiction mode independently of communicative function; retrospective depiction can coexist with anticipatory announcement.", "depiction_mode", depictionCriteria),
    ask("communicative_function", "Assess communicative function independently of depiction mode.", "communicative_function", functionCriteria),
    ask("time_relative_to_represented_speaker", "Assess time relative to the represented speaker. Do not decide from morphology alone.", "temporal_relation", temporalCriteria),
    ask("time_relative_to_communication_setting", "Assess time relative to the communication setting. It may differ from speaker-relative time; do not decide from morphology alone.", "temporal_relation", temporalCriteria)
  ];
}

/** Builds one bounded, no-network candidate-assessment request for review only. */
export async function buildIsaiahCandidateAssessment(repoRoot, { recordsDirectory } = {}) {
  const sourceWindow = [...await loadSourceVerses(repoRoot, { book: "Isaiah", chapter: 52, firstVerse: 13, lastVerse: 15 }), ...await loadSourceVerses(repoRoot, { book: "Isaiah", chapter: 53, firstVerse: 1, lastVerse: 12 })];
  const targetRaw = await loadPassage(repoRoot, { book: "Isaiah", chapter: 53, firstVerse: 4, lastVerse: 6 });
  const targetAnalysis = buildPropositions(targetRaw);
  const semanticState = await buildJevState(targetAnalysis, { resolveReferent: createReferentResolver(repoRoot) });
  const results = await loadSavedJevResults({ analysis: targetAnalysis, state: semanticState, recordsDirectory });
  const targets = targetAnalysis.propositions.map(compactTarget);
  const payload = {
    model: "typesafe/jev-1.13",
    state: {
      assessment_kind: "preliminary_prophetic_statement_candidate_assessment",
      selected_discourse_window: {
        reference: "Isaiah 52:13–53:12",
        selection_status: "selected_window_not_proven_discourse_boundary",
        reason: "Initial pilot window for interpreting Isaiah 53:4–6 assessment targets."
      },
      source_window: sourceWindow,
      assessment_targets: targets,
      question_definitions: { candidate_assessment: candidateCriteria, depiction_mode: depictionCriteria, communicative_function: functionCriteria, temporal_relation: temporalCriteria },
      prior_model_judgments: { kind: "prior_model_judgments_not_canonical_evidence", summaries: results.units.map(compactSemanticJudgment) },
      evidence_boundary: "Canonical source evidence and prior model judgments are separate. Prior distributions are local only.",
      assessment_audit_requirements: {
        for_each_target: ["supporting_source_word_ids", "governing_scope", "unresolved_assumptions", "evidence_against_candidate_reading"],
        constraint: "Use only IDs supplied in this request; absence of local modal marking is not contrary evidence."
      }
    },
    questions: Object.fromEntries(targets.flatMap(questionsFor).map(([id, question]) => [id, { type: question.type, instructions: question.instructions, criteria: question.criteria }]))
  };
  const local_record = {
    mode: "dry_run_only", builder_version: "0.1.0", request_fingerprint: hash(payload), request_size_bytes: Buffer.byteLength(JSON.stringify(payload), "utf8"),
    token_estimate: { method: "byte_divided_by_4", estimated_input_tokens: Math.ceil(Buffer.byteLength(JSON.stringify(payload), "utf8") / 4), exact_count_available: false, limitation: "No Jev tokenizer endpoint is available locally; this is a rough byte-based estimate, not an exact or guaranteed conservative token count." },
    response_requirements: {
      per_target: ["candidate assessment", "supporting source word IDs", "governing scope", "unresolved assumptions", "evidence against candidate reading"],
      limitation: "The Decisions choice response format returns distributions only. It cannot return supporting IDs or explanations; every output therefore requires human evidence review and no model rationale may be invented afterward."
    },
    readiness: { status: "ready_for_batched_candidate_assessment", missing_evidence: ["The supplied source window does not independently establish an external historical communication date; communication-setting temporal outputs must retain uncertainty where the internal setting is insufficient."], human_review_required: true },
    semantic_judgment_references: results.units.map(unit => ({ proposition_id: unit.proposition_id, request_fingerprint: unit.saved_request_fingerprint, record_status: unit.record_status }))
  };
  return { schema_version: "0.1.0", payload, local_record };
}

export function validateCandidateAssessment(dryRun) {
  const errors = [], { payload, local_record } = dryRun;
  if (payload.state.selected_discourse_window.reference !== "Isaiah 52:13–53:12") errors.push("wrong_selected_window");
  if (payload.state.assessment_targets.length !== 10) errors.push("wrong_target_count");
  if (payload.state.source_window.length !== 15 || payload.state.source_window[0]?.reference !== "Isaiah 52:13" || payload.state.source_window.at(-1)?.reference !== "Isaiah 53:12") errors.push("wrong_source_window_coverage");
  const sourceIds = payload.state.source_window.flatMap(verse => verse.source_word_ids);
  if (payload.state.source_window.some(verse => !verse.source_text || !verse.source_word_ids.length) || new Set(sourceIds).size !== sourceIds.length) errors.push("incomplete_or_duplicate_authoritative_source_window");
  if (Object.keys(payload.questions).length !== 50) errors.push("wrong_question_count");
  if (!payload.state.assessment_targets.find(target => target.proposition_id === "isa_53_04_2305300400720080_p1")?.grammatical_scope.governed_complements.length) errors.push("lost_considered_scope");
  if (JSON.stringify(payload).includes("probabilities")) errors.push("full_distributions_in_payload");
  if (JSON.stringify(payload).match(/none_expressed[^]*non-prophetic/iu)) errors.push("invalid_none_expressed_inference");
  if (!local_record.token_estimate.estimated_input_tokens) errors.push("missing_token_estimate");
  return { ok: errors.length === 0, errors };
}
