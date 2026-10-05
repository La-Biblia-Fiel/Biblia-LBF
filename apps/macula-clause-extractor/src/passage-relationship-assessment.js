import { createHash } from "node:crypto";
import { buildIsaiahPassageRelationships, validateIsaiahPassageRelationships } from "./passage-relationships.js";

const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const RELATIONSHIP_ASSESSMENT_VERSION = "0.1.0";
export const relationshipChoices = {
  establishes_announcement_anchor: "The source statement establishes a predictive announcement anchor within the supplied selected window. This is a discourse-function judgment, not a certification of truth.",
  contributes_to_announcement_anchor: "The source statement contributes to the identified proposed announcement anchor within the supplied window, without itself establishing that anchor.",
  surrounding_or_other_content: "The statement is surrounding material or has another discourse role; the supplied source does not positively support its connection as an anchor or contribution.",
  relationship_underdetermined: "The supplied source window and scope do not distinguish the relationship."
};

const compactStatement = statement => statement && ({
  proposition_id: statement.proposition_id,
  reference: statement.reference,
  source_text: statement.source_text,
  source_word_ids: statement.source_word_ids,
  predicate_word_id: statement.predicate_word_id,
  predicate_head: statement.predicate_head,
  grammatical_scope: statement.grammatical_scope
});

function stateRelationship(item) {
  return {
    relationship_id: `relationship:${item.source.proposition_id}:${item.relationship_type}`,
    source_statement: compactStatement(item.source),
    proposed_anchor_connection: compactStatement(item.target),
    proposed_local_relationship: item.relationship_type,
    governing_scope: item.governing_scope,
    source_ids_for_connection: item.connection_source_ids,
    hypothesis_boundary: "The proposed local relationship is a hypothesis to evaluate, not an expected answer. Evaluation scope and first-person plural wording do not predetermine an answer."
  };
}

/** Creates one no-network batch for every local Isaiah relationship proposal. */
export async function buildIsaiahRelationshipAssessment(repoRoot) {
  const graph = await buildIsaiahPassageRelationships(repoRoot);
  const graphValidation = validateIsaiahPassageRelationships(graph);
  if (!graphValidation.ok) throw new Error(`Invalid relationship graph: ${graphValidation.errors.join(", ")}`);
  const hypotheses = graph.relationships.map(stateRelationship);
  const payload = {
    model: "typesafe/jev-1.13",
    state: {
      assessment_kind: "passage_relationship_assessment",
      selected_discourse_window: graph.selected_discourse_window,
      source_window: graph.source_window,
      relationship_hypotheses: hypotheses,
      evidence_boundary: "Canonical source text and grammatical scope are evidence. Local relationship proposals are hypotheses, not answers. Existing Jev judgments are intentionally not included."
    },
    questions: Object.fromEntries(hypotheses.map(item => [`${item.relationship_id}:assessment`, {
      type: "choice",
      instructions: `Evaluate the relationship of ${item.source_statement.proposition_id} within the supplied Isaiah 52:13–53:12 window. The proposed anchor connection and local relationship are hypotheses only. Preserve the supplied governing scope: content governed by an evaluation remains governed, but that scope alone does not decide whether the governing act contributes. First-person plural wording alone does not decide a relationship. Choose relationship_underdetermined when the supplied evidence does not distinguish the choices.`,
      criteria: relationshipChoices
    }]))
  };
  return {
    payload,
    local_record: {
      builder_version: RELATIONSHIP_ASSESSMENT_VERSION,
      request_fingerprint: hash(payload),
      hypothesis_count: hypotheses.length,
      request_size_bytes: Buffer.byteLength(JSON.stringify(payload), "utf8"),
      token_estimate: { method: "byte_divided_by_4", estimated_input_tokens: Math.ceil(Buffer.byteLength(JSON.stringify(payload), "utf8") / 4), exact_count_available: false, limitation: "A local Jev tokenizer is unavailable; this is a rough byte-based estimate, not an exact token count." },
      expectations_boundary: "No expected relationship answers are stored or sent."
    }
  };
}

export function validateIsaiahRelationshipAssessment(dryRun) {
  const errors = [], { payload, local_record } = dryRun;
  if (payload.state.selected_discourse_window?.reference !== "Isaiah 52:13–53:12") errors.push("wrong_window");
  if (payload.state.relationship_hypotheses?.length !== 12 || Object.keys(payload.questions || {}).length !== 12) errors.push("wrong_relationship_question_count");
  for (const item of Object.values(payload.questions || {})) if (item.type !== "choice" || !item.criteria?.relationship_underdetermined) errors.push("invalid_question");
  const serialized = JSON.stringify(payload);
  if (serialized.includes("expected_outcomes") || serialized.includes("local_record")) errors.push("local_answers_leaked_to_payload");
  if (!serialized.includes("Evaluation scope and first-person plural wording do not predetermine an answer.")) errors.push("missing_scope_and_person_guard");
  if (!local_record.request_fingerprint || local_record.hypothesis_count !== 12) errors.push("missing_local_audit_data");
  return { ok: errors.length === 0, errors };
}
