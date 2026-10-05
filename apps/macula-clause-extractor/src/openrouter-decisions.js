/**
 * Pure serializer for OpenRouter's alpha Decisions API.  It deliberately has
 * no credential handling and no network code: producing a reviewable request
 * must never incur inference cost.
 */
export const OPENROUTER_JEV_MODEL = "typesafe/jev-1.13";
export const OPENROUTER_DECISIONS_ENDPOINT = "https://openrouter.ai/api/alpha/decisions";

const criterion = {
  direct_assertion: "The material is directly asserted in the passage.",
  reported_speech: "The material is presented as someone's reported speech.",
  thought_or_evaluation: "The material is governed by a thought, consideration, or evaluation rather than asserted independently.",
  conditional_or_hypothetical: "The material is presented as conditional or hypothetical.",
  event: "The named target predication is an occurrence, action, or process, including a mental act such as considering or deciding.",
  state_or_relation: "The named target predication is a condition, disposition, resulting state, or relation presented as holding.",
  event_state_ambiguous: "Both event and state readings of the named target predication are supported, and the supplied evidence does not distinguish them.",
  prior: "The named target predication is presented as prior to the represented speaker or narrator's discourse reference point, not the modern reader or date of composition.",
  current_or_general: "The named target predication is presented as current at, or general relative to, the represented speaker or narrator's discourse reference point.",
  subsequent: "The named target predication is presented as subsequent to the represented speaker or narrator's discourse reference point.",
  temporally_unspecified: "No temporal placement is expressed for the named target predication.",
  asserted: "The named target predication is presented as occurring or holding within its governing discourse scope. This is a textual presentation judgment, not certification of truth.",
  questioned: "The named target predication is asked about rather than asserted.",
  hypothetical: "The named target predication is entertained or supposed without asserting its occurrence.",
  intention: "A goal, plan, or intention to bring about the named target predication is expressed.",
  expectation_or_prediction: "An anticipation or prediction that the named target predication will occur is expressed.",
  directive_or_obligation: "A command, request, or obligation concerning the named target predication is expressed.",
  possibility_or_permission: "Possibility or permission concerning the named target predication is expressed.",
  none_expressed: "No prospective or modal expression is expressed for the named target predication. This does not determine temporal orientation.",
  multiple: "More than one listed prospective or modal expression is explicitly expressed for the named target predication.",
  source_or_origin: "The named phrase identifies where the named predicate's situation originates.",
  separation: "The named predicate describes removal or movement away from the phrase's referent.",
  comparison: "The named phrase supplies a comparison or standard for the named predicate.",
  cause_or_reason: "The named phrase supplies a cause, reason, or ground for the named predicate.",
  location: "The phrase expresses location.",
  association: "The phrase expresses association.",
  means_or_instrument: "The phrase expresses means or instrument.",
  direction_or_goal: "The phrase expresses direction or goal.",
  recipient_or_beneficiary: "The phrase expresses recipient or beneficiary.",
  possession_or_relation: "The phrase expresses possession or relation.",
  approximation: "The phrase expresses approximation.",
  location_or_contact: "The phrase expresses location or contact.",
  direction: "The phrase expresses direction.",
  topic_or_concern: "The phrase expresses topic or concern.",
  other: "The phrase expresses another relationship not listed here.",
  underdetermined: "The source evidence does not determine one of the available answers."
};

function choicesToCriteria(choices) {
  return Object.fromEntries(choices.map(choice => [choice, criterion[choice] || `Select ${choice} only if it best fits the supplied source evidence.`]));
}

function decisionQuestion(question) {
  return {
    type: "choice",
    instructions: `${question.prompt} Inspect only the supplied state. Evidence for this question: ${JSON.stringify(question.evidence)}. Choose underdetermined when the source evidence does not support a choice.`,
    criteria: choicesToCriteria(question.answer_choices)
  };
}

/**
 * Target objects are source-linked request evidence, not a response contract.
 * They remain in state so the saved exact request retains the target/scope that
 * each question was asked to evaluate.
 */
function questionTargets(questions) {
  return Object.fromEntries(questions.map(question => [question.question_id, question.evidence]));
}

/** Converts one locally-audited builder request into the exact HTTP JSON body. */
export function serializeOpenRouterDecision({ analysis_unit, context_additions, questions }, { model = OPENROUTER_JEV_MODEL } = {}) {
  return {
    model,
    state: { analysis_unit, context_additions, question_targets: questionTargets(questions) },
    questions: Object.fromEntries(questions.map(question => [question.question_id, decisionQuestion(question)]))
  };
}

export function validateOpenRouterDecision(payload) {
  const errors = [];
  if (payload.model !== OPENROUTER_JEV_MODEL) errors.push("unpinned_or_unknown_model");
  if (!payload.state?.analysis_unit?.proposition_id) errors.push("missing_analysis_unit");
  if (!payload.state?.question_targets || !Object.keys(payload.state.question_targets).length) errors.push("missing_question_targets");
  if (!payload.questions || !Object.keys(payload.questions).length) errors.push("missing_questions");
  for (const [id, question] of Object.entries(payload.questions || {})) {
    if (question.type !== "choice") errors.push(`question_${id}_not_choice`);
    if (!question.criteria?.underdetermined) errors.push(`question_${id}_missing_underdetermined`);
    if (!payload.state.question_targets?.[id]) errors.push(`question_${id}_missing_target`);
  }
  if (JSON.stringify(payload).match(/response_contract|request_fingerprint|OPENROUTER_API_KEY|\bprophecy\b|\bmessianic\b|\bfulfilled\b/iu)) errors.push("forbidden_or_audit_only_content_in_payload");
  return { ok: errors.length === 0, errors };
}
