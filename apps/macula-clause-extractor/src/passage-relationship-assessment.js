import { createHash } from "node:crypto";
import { buildIsaiahPassageRelationships, validateIsaiahPassageRelationships } from "./passage-relationships.js";

const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const RELATIONSHIP_ASSESSMENT_VERSION = "0.2.0";
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
    // This identifier is deliberately neutral: future model requests must not
    // leak a local relationship label through an ID or a field name.
    relationship_id: `relationship:${item.source.proposition_id}:${item.target?.proposition_id || "window_anchor"}`,
    source_statement: compactStatement(item.source),
    anchor_hypothesis: compactStatement(item.target),
    governing_scope: item.governing_scope,
    source_ids_for_connection: item.connection_source_ids,
    hypothesis_boundary: "The source statement and anchor hypothesis are supplied for evaluation. Evaluation scope and first-person plural wording do not predetermine a category."
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
      evidence_boundary: "Canonical source text, grammatical scope, neutral statement targets, and anchor hypotheses are evidence. Local labels and target-specific expected classifications are intentionally not included. Existing Jev judgments are intentionally not included."
    },
    questions: Object.fromEntries(hypotheses.map(item => [`${item.relationship_id}:assessment`, {
      type: "choice",
      instructions: `Evaluate the relationship of ${item.source_statement.proposition_id} to the supplied anchor hypothesis within the Isaiah 52:13–53:12 window. Preserve the supplied governing scope: content governed by an evaluation remains governed, but that scope alone does not decide whether the governing act contributes. First-person plural wording alone does not decide a relationship. Choose relationship_underdetermined when the supplied evidence does not distinguish the choices.`,
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
  const forbiddenKeys = new Set(["proposed_local_relationship", "expected_outcomes", "expected_answer", "expected_relationship", "expected_classification"]);
  const payloadKeys = [];
  const visit = value => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) { payloadKeys.push(key); visit(child); }
  };
  visit(payload);
  if (payloadKeys.some(key => forbiddenKeys.has(key))) errors.push("local_labels_or_expected_classifications_leaked_to_payload");
  if (Object.keys(payload.questions || {}).some(id => /proposed_|surrounding_or_other|unresolved_relationship/iu.test(id))) errors.push("classification_leaked_through_question_id");
  if (!JSON.stringify(payload).includes("Evaluation scope and first-person plural wording do not predetermine a category.")) errors.push("missing_scope_and_person_guard");
  if (!local_record.request_fingerprint || local_record.hypothesis_count !== 12) errors.push("missing_local_audit_data");
  return { ok: errors.length === 0, errors };
}
