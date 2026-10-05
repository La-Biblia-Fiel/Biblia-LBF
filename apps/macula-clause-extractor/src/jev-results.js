import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { requestFingerprint } from "./ollama-systemone.js";
import { OPENROUTER_JEV_MODEL } from "./openrouter-decisions.js";

const readJson = async (path, fallback) => {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
};

function evidenceFor(proposition) {
  return {
    source_expression: proposition.source,
    predicate: proposition.predicate,
    grammatical_scope: {
      source_rule: proposition.syntax.rule,
      complements: proposition.complements.map(complement => ({ source_text: complement.text, word_ids: complement.word_ids, scope: complement.scope, predicates: complement.predicates }))
    },
    participants: proposition.participants,
    arguments: proposition.arguments,
    unresolved_relations: proposition.relations.filter(relation => relation.semantic_role === null)
  };
}

function questionsFor(record, request) {
  const specifications = record.exact_api_request?.questions || {}, answers = record.raw_response?.answers || {};
  const localQuestions = new Map((request?.local_record?.question_specification || []).map(question => [question.question_id, question]));
  const savedTargets = record.exact_api_request?.state?.question_targets || {};
  return Object.entries(specifications).map(([question_id, specification]) => ({
    question_id, question_version: record.question_versions?.[question_id] ?? null,
    instructions: specification.instructions, criteria: specification.criteria,
    explicit_target: savedTargets[question_id] ?? localQuestions.get(question_id)?.evidence ?? null,
    target_provenance: savedTargets[question_id] ? "saved_exact_api_request" : localQuestions.has(question_id) ? "current_builder_specification_fingerprint_matched_to_saved_request" : "not_available_in_saved_provider_payload",
    judgment: answers[question_id] ? { selected_answer: answers[question_id].choice, probabilities: answers[question_id].probabilities, reported_confidence: answers[question_id].confidence } : null
  }));
}

function modelJudgment(record, request) {
  return {
    status: record.status, provider_kind: record.provider_kind, requested_model: record.requested_model, served_model: record.served_model, provider: record.provider,
    builder_version: record.builder_version, question_versions: record.question_versions, request_id: record.request_id, request_fingerprint: record.request_fingerprint,
    response_validation: record.response_validation, usage: record.usage, elapsed_ms: record.elapsed_ms, attempted_at: record.attempted_at, questions: questionsFor(record, request)
  };
}

/** Joins canonical propositions to saved Jev attempts without modifying either layer. */
export async function loadSavedJevResults({ analysis, state, recordsDirectory, model = OPENROUTER_JEV_MODEL }) {
  const index = await readJson(join(recordsDirectory, "index.json"), { attempts: [] });
  const requestByProposition = new Map(state.requests.map(request => [request.proposition_id, request]));
  const units = [];
  for (const proposition of analysis.propositions) {
    const request = requestByProposition.get(proposition.proposition_id);
    const currentFingerprint = request ? requestFingerprint({ ...request.payload, model }) : null;
    const attempts = index.attempts.filter(attempt => attempt.proposition_id === proposition.proposition_id && attempt.requested_model === model);
    const currentSuccess = attempts.filter(attempt => attempt.request_fingerprint === currentFingerprint && attempt.status === "succeeded").at(-1);
    const matchingAttempt = currentSuccess || attempts.filter(attempt => attempt.request_fingerprint === currentFingerprint).at(-1);
    const saved = matchingAttempt ? await readJson(join(recordsDirectory, matchingAttempt.file), null) : null;
    units.push({
      proposition_id: proposition.proposition_id, reference: proposition.reference, linguistic_evidence: evidenceFor(proposition),
      record_status: currentSuccess ? "current_saved_result" : attempts.length ? "outdated_or_unsuccessful_record" : "missing_record",
      current_request_fingerprint: currentFingerprint, saved_request_fingerprint: saved?.request_fingerprint ?? null, saved_record_file: matchingAttempt?.file ?? null,
      model_judgment: saved ? modelJudgment(saved, request) : null
    });
  }
  return {
    schema_version: "0.1.0", read_only: true, objective: "Finding prophetic statements in Scripture",
    label: "Preliminary semantic analysis — not prophecy classification",
    warning: "Jev outputs are model judgments, not linguistic source facts. They never overwrite canonical propositions; asserted, none_expressed, and uncertain temporal results are not evidence that a proposition is non-prophetic.",
    requested_model: model, records_directory: recordsDirectory, units
  };
}
