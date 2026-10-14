import { createHash } from "node:crypto";
import { buildContextWindowRequest } from "./candidate-scan.js";

const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const NARRATIVE_SEPARATION_VERIFICATION_VERSION = "0.1.0";
const announcementIds = new Set([
  "book_13_02_1101300201310050_p1", "book_13_02_1101300201920110_p1", "book_13_02_1101300202620050_p1",
  "book_13_03_1101300301210030_p1", "book_13_03_1101300301420060_p1"
]);

function targetQuestions(prefix, sourceRequest, units) {
  return Object.fromEntries(units.flatMap(unit => [
    [`${prefix}:${unit.statement_id}:candidate_assessment`, sourceRequest.questions[`${unit.statement_id}:candidate_assessment`]],
    [`${prefix}:${unit.statement_id}:statement_function`, sourceRequest.questions[`${unit.statement_id}:statement_function`]]
  ]));
}

/** One batched request only. Local expected answers do not enter the payload. */
export async function buildNarrativeSeparationVerification(repoRoot) {
  const broad = await buildContextWindowRequest(repoRoot, { book: "1 Kings", chapter: 13, firstVerse: 1, lastVerse: 3 });
  const isolated = await buildContextWindowRequest(repoRoot, { book: "1 Kings", chapter: 13, firstVerse: 1, lastVerse: 1 });
  const narratives = broad.state.statements.filter(unit => unit.reference.verse === 1);
  const isolatedNarratives = isolated.state.statements.filter(unit => unit.reference.verse === 1);
  const controls = broad.state.statements.filter(unit => announcementIds.has(unit.statement_id));
  if (narratives.length !== 3 || controls.length !== announcementIds.size) throw new Error("Expected 1 Kings 13 narrative or announcement targets are unavailable.");
  if (JSON.stringify(narratives.map(unit => unit.statement_id).sort()) !== JSON.stringify(isolatedNarratives.map(unit => unit.statement_id).sort())) throw new Error("Narrative targets differ across the two contexts.");
  const payload = {
    model: broad.model,
    state: {
      verification_kind: "narrative_separation_with_positive_controls",
      template_version: NARRATIVE_SEPARATION_VERIFICATION_VERSION,
      common_instructions: broad.state.common_instructions,
      question_definitions: broad.state.question_definitions,
      contexts: {
        broad_1_kings_13_1_3: { source_window: broad.state.source_window, target_statements: [...narratives, ...controls] },
        isolated_1_kings_13_1: { source_window: isolated.state.source_window, target_statements: isolatedNarratives }
      }
    },
    questions: { ...targetQuestions("broad", broad, [...narratives, ...controls]), ...targetQuestions("isolated", isolated, isolatedNarratives) }
  };
  const local_record = {
    builder_version: NARRATIVE_SEPARATION_VERIFICATION_VERSION,
    request_fingerprint: hash(payload),
    expected_candidate_answers: Object.fromEntries([
      ...narratives.flatMap(unit => [[`broad:${unit.statement_id}:candidate_assessment`, "no_support_in_supplied_context"], [`isolated:${unit.statement_id}:candidate_assessment`, "no_support_in_supplied_context"]]),
      ...controls.map(unit => [`broad:${unit.statement_id}:candidate_assessment`, "supported_candidate"])
    ]),
    expectation_boundary: "Expected answers are local verification criteria and intentionally excluded from the model-facing payload.",
    target_sets: { narrative_statement_ids: narratives.map(unit => unit.statement_id), positive_control_statement_ids: controls.map(unit => unit.statement_id) },
    token_estimate: { method: "byte_divided_by_4", estimated_input_tokens: Math.ceil(Buffer.byteLength(JSON.stringify(payload), "utf8") / 4), exact_count_available: false, limitation: "Rough estimate only; the response records actual provider usage." }
  };
  return { payload, local_record };
}

export function validateNarrativeSeparationVerification(dryRun) {
  const errors = [], { payload, local_record } = dryRun;
  const narrativeIds = local_record.target_sets.narrative_statement_ids;
  if (narrativeIds.length !== 3) errors.push("wrong_narrative_target_count");
  for (const id of narrativeIds) for (const prefix of ["broad", "isolated"]) {
    if (!payload.questions[`${prefix}:${id}:candidate_assessment`]) errors.push(`missing_${prefix}_candidate_question:${id}`);
    if (!payload.questions[`${prefix}:${id}:statement_function`]) errors.push(`missing_${prefix}_function_question:${id}`);
  }
  if (local_record.target_sets.positive_control_statement_ids.length !== 5) errors.push("wrong_positive_control_count");
  if (JSON.stringify(payload).includes("expected_candidate_answers")) errors.push("expectations_leaked_to_payload");
  if (Object.values(payload.questions).some(question => question.type !== "choice" || !question.criteria?.underdetermined || !question.instructions.includes("Target only statement"))) errors.push("question_template_not_corrected");
  return { ok: errors.length === 0, errors };
}
