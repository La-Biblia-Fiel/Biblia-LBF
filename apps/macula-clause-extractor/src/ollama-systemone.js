import { createHash } from "node:crypto";

export const DEFAULT_OLLAMA_SYSTEMONE_ENDPOINT = "http://localhost:11434/v1/systemone";
export const DEFAULT_NIMBLE_MODEL = "nimble";

const stable = value => JSON.stringify(value);
export const requestFingerprint = payload => createHash("sha256").update(stable(payload)).digest("hex");

/** The state builder already produces the provider-neutral System One shape. */
export function serializeOllamaSystemOneDecision(builderPayload, { model = DEFAULT_NIMBLE_MODEL } = {}) {
  return { model, state: builderPayload.state, questions: builderPayload.questions };
}

export function validateOllamaSystemOnePayload(payload) {
  const errors = [];
  if (!payload.model || typeof payload.model !== "string") errors.push("missing_model");
  if (!payload.state?.analysis_unit?.proposition_id) errors.push("missing_analysis_unit");
  if (!payload.questions || !Object.keys(payload.questions).length) errors.push("missing_questions");
  for (const [id, question] of Object.entries(payload.questions || {})) {
    if (question.type !== "choice") errors.push(`question_${id}_not_choice`);
    if (!question.instructions || !question.criteria || !Object.keys(question.criteria).length) errors.push(`question_${id}_missing_instructions_or_criteria`);
    if (!question.criteria?.underdetermined) errors.push(`question_${id}_missing_underdetermined`);
  }
  if (JSON.stringify(payload).match(/response_contract|request_fingerprint|OPENROUTER_API_KEY|OLLAMA_API_KEY|\bprophecy\b|\bmessianic\b|\bfulfilled\b/iu)) errors.push("forbidden_or_audit_only_content_in_payload");
  return { ok: errors.length === 0, errors };
}

const finiteProbability = value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

/** Validates rather than normalizes: probabilities and choices remain model judgments. */
export function validateSystemOneResponse(raw, payload) {
  const errors = [];
  const answers = raw?.answers;
  const expectedIds = Object.keys(payload.questions || {});
  if (!answers || typeof answers !== "object") errors.push("missing_answers");
  for (const id of expectedIds) {
    const answer = answers?.[id];
    const allowed = Object.keys(payload.questions[id].criteria);
    if (!answer || typeof answer !== "object") { errors.push(`missing_answer:${id}`); continue; }
    if (!allowed.includes(answer.choice)) errors.push(`invalid_choice:${id}`);
    if (!answer.probabilities || typeof answer.probabilities !== "object") { errors.push(`missing_probabilities:${id}`); continue; }
    const probabilityKeys = Object.keys(answer.probabilities).sort();
    if (stable(probabilityKeys) !== stable([...allowed].sort())) errors.push(`probability_options_mismatch:${id}`);
    const values = Object.values(answer.probabilities);
    if (!values.every(finiteProbability)) errors.push(`invalid_probability:${id}`);
    const sum = values.reduce((total, value) => total + value, 0);
    if (Math.abs(sum - 1) > 0.02) errors.push(`probabilities_do_not_sum_to_one:${id}:${sum}`);
    if (!finiteProbability(answer.confidence)) errors.push(`invalid_confidence:${id}`);
  }
  for (const id of Object.keys(answers || {})) if (!expectedIds.includes(id)) errors.push(`unexpected_answer:${id}`);
  return { ok: errors.length === 0, errors };
}

function findContext(value, path = "") {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, item]) => {
    const next = path ? `${path}.${key}` : key;
    const found = /(?:context.*(?:length|size)|num_ctx)/iu.test(key) && Number.isFinite(Number(item)) ? [{ path: next, tokens: Number(item) }] : [];
    return found.concat(findContext(item, next));
  });
}

export function contextSettingsFromShow(show) {
  const candidates = findContext(show);
  const parameters = typeof show?.parameters === "string" ? [...show.parameters.matchAll(/(?:num_ctx|context_length)\s+(\d+)/giu)].map(match => ({ path: "parameters", tokens: Number(match[1]) })) : [];
  const all = candidates.concat(parameters).filter(item => item.tokens > 0);
  // A Modelfile's num_ctx is the active runtime limit; architecture metadata is
  // only the model's possible maximum. Prefer the configured value when shown.
  const configured = parameters.filter(item => item.tokens > 0);
  return { available: all.length > 0, candidates: all, effective_tokens: configured.length ? Math.min(...configured.map(item => item.tokens)) : all.length ? Math.max(...all.map(item => item.tokens)) : null };
}

export function extractUsage(raw) {
  const usage = raw?.usage || {};
  return {
    input_tokens: usage.input_tokens ?? usage.prompt_tokens ?? raw?.prompt_eval_count ?? null,
    output_tokens: usage.output_tokens ?? usage.completion_tokens ?? raw?.eval_count ?? null
  };
}
