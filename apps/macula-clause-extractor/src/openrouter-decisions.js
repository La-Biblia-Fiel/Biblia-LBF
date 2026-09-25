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
  event: "The predicate presents an event or occurrence.",
  state_or_relation: "The predicate presents a state, condition, or relation.",
  other_content: "The predicate presents another kind of content.",
  prior: "The content is presented as prior to the passage's speaking context.",
  current_or_general: "The content is presented as current or generally valid in the passage's speaking context.",
  subsequent: "The content is presented as subsequent to the passage's speaking context.",
  temporally_unspecified: "The passage does not present a temporal orientation.",
  actual: "The content is presented as actual.",
  expected: "The content is presented as expected.",
  intended: "The content is presented as intended.",
  commanded: "The content is presented as commanded.",
  possible: "The content is presented as possible.",
  conditional: "The content is presented as conditional.",
  source_or_origin: "The phrase expresses source or origin.",
  separation: "The phrase expresses separation or removal.",
  comparison: "The phrase expresses comparison.",
  cause_or_reason: "The phrase expresses cause or reason.",
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

/** Converts one locally-audited builder request into the exact HTTP JSON body. */
export function serializeOpenRouterDecision({ analysis_unit, context_additions, questions }, { model = OPENROUTER_JEV_MODEL } = {}) {
  return {
    model,
    state: { analysis_unit, context_additions },
    questions: Object.fromEntries(questions.map(question => [question.question_id, decisionQuestion(question)]))
  };
}

export function validateOpenRouterDecision(payload) {
  const errors = [];
  if (payload.model !== OPENROUTER_JEV_MODEL) errors.push("unpinned_or_unknown_model");
  if (!payload.state?.analysis_unit?.proposition_id) errors.push("missing_analysis_unit");
  if (!payload.questions || !Object.keys(payload.questions).length) errors.push("missing_questions");
  for (const [id, question] of Object.entries(payload.questions || {})) {
    if (question.type !== "choice") errors.push(`question_${id}_not_choice`);
    if (!question.criteria?.underdetermined) errors.push(`question_${id}_missing_underdetermined`);
  }
  if (JSON.stringify(payload).match(/response_contract|request_fingerprint|OPENROUTER_API_KEY|\bprophecy\b|\bmessianic\b|\bfulfilled\b/iu)) errors.push("forbidden_or_audit_only_content_in_payload");
  return { ok: errors.length === 0, errors };
}
