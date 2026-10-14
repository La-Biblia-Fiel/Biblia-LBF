import { createHash } from "node:crypto";

export const COMPACT_SCAN_SERIALIZATION_VERSION = "0.2.0-compact.1";
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const byteSize = value => Buffer.byteLength(JSON.stringify(value), "utf8");

function compactScope(scope) {
  return { k: scope?.kind || "unspecified", c: (scope?.complements || []).map(item => ({ w: item.word_ids, s: item.scope })) };
}
function choiceSet(question) {
  const kind = question.question_kind || "";
  if (kind) return kind;
  const keys = Object.keys(question.criteria || {});
  if (keys.includes("supported_candidate")) return "candidate_assessment";
  if (keys.includes("predictive_content")) return "statement_function";
  if (keys.includes("establishes_announcement_anchor")) return "relationship";
  throw new Error("Cannot determine compact choice set from a scan question.");
}
function kindFromId(id, question) { return question.question_kind || id.split(":").at(-1) || "choice"; }
function compactCriteria(question, set) {
  // Keep criteria per question because saved successful Decisions requests and
  // response validation bind an answer distribution to those exact option keys.
  return Object.fromEntries(Object.keys(question.criteria || {}).map(choice => [choice, `${set}.${choice}`]));
}
function compactInstruction(target, kind) {
  return `Assess ${kind} for ${target} within its governing scope; use the shared definitions and supplied scope.`;
}

/**
 * Serialization-only optimization. It does not alter a question's choices,
 * scope, source window, or assessment criteria.
 */
export function compactScanPayload(fullPayload) {
  const source = fullPayload.state?.source_window;
  const units = fullPayload.state?.statements;
  if (!Array.isArray(source) || !Array.isArray(units)) throw new Error("Expected a candidate scan payload with source_window and statements.");
  const targetMap = {}, targets = {};
  for (const [index, unit] of units.entries()) {
    const localId = `t${index}`;
    targets[localId] = { w: unit.source_word_ids, p: { w: unit.predicate?.word_id, v: unit.predicate?.voice }, s: compactScope(unit.governing_scope) };
    targetMap[unit.statement_id] = { local_id: localId, permanent_statement_id: unit.statement_id, reference: unit.reference, source_text: unit.source_text, source_word_ids: unit.source_word_ids, predicate: unit.predicate, governing_scope: unit.governing_scope };
  }
  const questionMap = {}, questions = {};
  let index = 0;
  for (const [permanentId, question] of Object.entries(fullPayload.questions || {})) {
    const permanentStatementId = permanentId.split(":").slice(0, -1).join(":"), target = targetMap[permanentStatementId];
    if (!target) throw new Error(`Question target is unavailable: ${permanentId}`);
    const localId = `q${index++}`, kind = kindFromId(permanentId, question), set = choiceSet({ ...question, question_kind: kind });
    questions[localId] = { type: "choice", target: target.local_id, kind, instructions: compactInstruction(target.local_id, kind), criteria: compactCriteria(question, set) };
    questionMap[localId] = { permanent_question_id: permanentId, permanent_statement_id: permanentStatementId, target_local_id: target.local_id, question_kind: kind, choice_set: set, allowed_choices: Object.keys(question.criteria || {}) };
  }
  const window = { v: source, ...(fullPayload.state?.context_window ? { x: fullPayload.state.context_window } : {}) };
  const payload = {
    model: fullPayload.model,
    state: {
      v: COMPACT_SCAN_SERIALIZATION_VERSION,
      i: fullPayload.state.common_instructions,
      d: fullPayload.state.question_definitions,
      w: { w0: window },
      t: targets
    },
    questions
  };
  const local_record = {
    serialization_version: COMPACT_SCAN_SERIALIZATION_VERSION,
    permanent_request_fingerprint: hash(fullPayload), compact_request_fingerprint: hash(payload),
    target_map: targetMap, question_map: questionMap,
    audit_boundary: "Permanent statement IDs, display text, full scope text, and source references are retained locally and are not model-facing compact payload metadata."
  };
  return { payload, local_record };
}

export function validateCompactScanPayload(compacted, fullPayload) {
  const errors = [], fullQuestions = fullPayload.questions || {}, compactQuestions = compacted.payload.questions || {};
  if (Object.keys(fullQuestions).length !== Object.keys(compactQuestions).length) errors.push("question_count_changed");
  if (!compacted.payload.state?.i || !compacted.payload.state?.d || !compacted.payload.state?.w?.w0?.v) errors.push("missing_shared_evidence_or_definitions");
  for (const [localId, mapping] of Object.entries(compacted.local_record.question_map || {})) {
    const full = fullQuestions[mapping.permanent_question_id], compact = compactQuestions[localId];
    if (!full || !compact) { errors.push(`missing_question:${localId}`); continue; }
    if (typeof compact.instructions !== "string" || !compact.instructions.trim()) errors.push(`missing_question_instructions:${localId}`);
    if (JSON.stringify(Object.keys(full.criteria || {}).sort()) !== JSON.stringify(Object.keys(compact.criteria || {}).sort())) errors.push(`choice_mapping_changed:${localId}`);
    const target = compacted.payload.state.t?.[compact.target];
    const original = compacted.local_record.target_map?.[mapping.permanent_statement_id];
    if (!target) { errors.push(`missing_target:${localId}`); continue; }
    if (!original?.governing_scope) { errors.push(`scope_not_preserved_locally:${localId}`); continue; }
    const sourceIds = new Set(Object.values(compacted.payload.state.w || {}).flatMap(window => window?.v || []).flatMap(verse => verse.source_word_ids || []));
    const expectedScope = compactScope(original.governing_scope);
    if (JSON.stringify(target.w) !== JSON.stringify(original.source_word_ids)) errors.push(`target_span_changed:${localId}`);
    if (!Array.isArray(target.w) || target.w.some(id => !sourceIds.has(id))) errors.push(`target_span_not_resolvable_in_payload:${localId}`);
    if (!target.p?.w || !target.w?.includes(target.p.w)) errors.push(`predicate_head_not_in_target_span:${localId}`);
    if (JSON.stringify(target.s) !== JSON.stringify(expectedScope)) errors.push(`scope_not_semantically_equivalent:${localId}`);
    for (const complement of target.s?.c || []) if (!Array.isArray(complement.w) || complement.w.some(id => !sourceIds.has(id))) errors.push(`scope_span_not_resolvable_in_payload:${localId}`);
  }
  if (JSON.stringify(compacted.payload).match(/permanent_statement_id|permanent_question_id|request_fingerprint|audit_boundary/iu)) errors.push("audit_metadata_leaked_to_payload");
  return { ok: errors.length === 0, errors };
}

export function compactSizeComparison(fullPayload, compacted) {
  const fullBytes = byteSize(fullPayload), compactBytes = byteSize(compacted.payload);
  return { full_bytes: fullBytes, compact_bytes: compactBytes, saved_bytes: fullBytes - compactBytes, reduction_percent: Number((((fullBytes - compactBytes) / fullBytes) * 100).toFixed(2)), rough_full_input_tokens: Math.ceil(fullBytes / 4), rough_compact_input_tokens: Math.ceil(compactBytes / 4) };
}

/** Compact form of the fixed two-context narrative-separation control. */
export function compactNarrativeSeparationPayload(fullPayload) {
  const contexts = fullPayload.state?.contexts;
  if (!contexts || typeof contexts !== "object") throw new Error("Expected narrative-separation contexts.");
  const targets = {}, targetMap = {}, contextToWindow = {}, targetByContextStatement = {};
  let targetIndex = 0, windowIndex = 0;
  for (const [contextId, context] of Object.entries(contexts)) {
    const windowId = `w${windowIndex++}`;
    contextToWindow[contextId] = windowId;
    for (const unit of context.target_statements || []) {
      const localId = `t${targetIndex++}`, composite = `${contextId}:${unit.statement_id}`;
      targets[localId] = { w: unit.source_word_ids, p: { w: unit.predicate?.word_id, v: unit.predicate?.voice }, s: compactScope(unit.governing_scope) };
      targetMap[composite] = { local_id: localId, context_id: contextId, window_local_id: windowId, permanent_statement_id: unit.statement_id, reference: unit.reference, source_text: unit.source_text, source_word_ids: unit.source_word_ids, predicate: unit.predicate, governing_scope: unit.governing_scope };
      targetByContextStatement[composite] = localId;
    }
  }
  const questions = {}, questionMap = {};
  let questionIndex = 0;
  for (const [permanentId, question] of Object.entries(fullPayload.questions || {})) {
    const [prefix, statementId, kind] = permanentId.split(":");
    const contextId = Object.keys(contexts).find(id => id === prefix || id.startsWith(`${prefix}_`));
    const composite = `${contextId}:${statementId}`, target = targetMap[composite];
    if (!target) throw new Error(`Narrative control target is unavailable: ${permanentId}`);
    const localId = `q${questionIndex++}`, set = choiceSet({ ...question, question_kind: kind });
    questions[localId] = { type: "choice", target: target.local_id, kind, instructions: compactInstruction(target.local_id, kind), criteria: compactCriteria(question, set) };
    questionMap[localId] = { permanent_question_id: permanentId, permanent_statement_id: statementId, context_id: contextId, target_local_id: target.local_id, question_kind: kind, choice_set: set, allowed_choices: Object.keys(question.criteria || {}) };
  }
  const windows = Object.fromEntries(Object.entries(contexts).map(([contextId, context]) => [contextToWindow[contextId], { v: context.source_window }]));
  const payload = { model: fullPayload.model, state: { v: COMPACT_SCAN_SERIALIZATION_VERSION, i: fullPayload.state.common_instructions, d: fullPayload.state.question_definitions, w: windows, t: targets }, questions };
  return { payload, local_record: { serialization_version: COMPACT_SCAN_SERIALIZATION_VERSION, permanent_request_fingerprint: hash(fullPayload), compact_request_fingerprint: hash(payload), target_map: targetMap, question_map: questionMap, context_window_map: contextToWindow, audit_boundary: "Permanent IDs, expected control outcomes, readable text, and audit references remain outside the compact model payload." } };
}

export function validateCompactNarrativeSeparationPayload(compacted, fullPayload) {
  const errors = [], sourceIdsByWindow = Object.fromEntries(Object.entries(compacted.payload.state?.w || {}).map(([id, window]) => [id, new Set((window.v || []).flatMap(verse => verse.source_word_ids || []))]));
  for (const [localQuestionId, mapping] of Object.entries(compacted.local_record.question_map || {})) {
    const question = compacted.payload.questions?.[localQuestionId], original = fullPayload.questions?.[mapping.permanent_question_id], target = compacted.payload.state?.t?.[question?.target];
    const unit = compacted.local_record.target_map?.[`${mapping.context_id}:${mapping.permanent_statement_id}`];
    if (!question || !original || !target || !unit) { errors.push(`missing_mapping:${localQuestionId}`); continue; }
    if (typeof question.instructions !== "string" || !question.instructions.trim()) errors.push(`missing_question_instructions:${localQuestionId}`);
    if (JSON.stringify(Object.keys(question.criteria).sort()) !== JSON.stringify(Object.keys(original.criteria).sort())) errors.push(`choice_mapping_changed:${localQuestionId}`);
    const sourceIds = sourceIdsByWindow[unit.window_local_id];
    if (JSON.stringify(target.w) !== JSON.stringify(unit.source_word_ids) || target.w.some(id => !sourceIds?.has(id))) errors.push(`target_span_not_resolvable_in_payload:${localQuestionId}`);
    if (!target.p?.w || !target.w.includes(target.p.w)) errors.push(`predicate_head_not_in_target_span:${localQuestionId}`);
    if (JSON.stringify(target.s) !== JSON.stringify(compactScope(unit.governing_scope))) errors.push(`scope_not_semantically_equivalent:${localQuestionId}`);
    for (const complement of target.s?.c || []) if (complement.w.some(id => !sourceIds?.has(id))) errors.push(`scope_span_not_resolvable_in_payload:${localQuestionId}`);
  }
  if (!compacted.payload.state?.i || !compacted.payload.state?.d) errors.push("missing_shared_evidence_or_definitions");
  if (JSON.stringify(compacted.payload).match(/permanent_statement_id|permanent_question_id|expected_candidate_answers|request_fingerprint|audit_boundary/iu)) errors.push("audit_metadata_leaked_to_payload");
  return { ok: errors.length === 0, errors };
}
