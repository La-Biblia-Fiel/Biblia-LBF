import { loadPassage, loadSourceVerses } from "./extractor.js";
import { buildPropositions } from "./propositions.js";

export const PASSAGE_RELATIONSHIP_VERSION = "0.1.0";

const evidence = proposition => ({
  proposition_id: proposition.proposition_id,
  reference: proposition.reference,
  source_text: proposition.source.text,
  source_word_ids: proposition.source.word_ids,
  predicate_word_id: proposition.predicate.word_id,
  predicate_head: proposition.predicate.text,
  grammatical_scope: proposition.complements.length
    ? { kind: "governing_predication_with_complement", complements: proposition.complements.map(item => ({ source_text: item.text, source_word_ids: item.word_ids, scope: item.scope })) }
    : { kind: "independent_clause_in_extracted_proposition", complements: [] }
});

function relationship({ type, source, target, governingScope, uncertainty }) {
  return {
    relationship_type: type,
    assessment_status: "unassessed",
    source: evidence(source),
    target: target ? evidence(target) : null,
    connection_source_ids: [...source.source.word_ids, ...(target?.source.word_ids || [])],
    governing_scope: governingScope,
    uncertainty
  };
}

/**
 * Builds a local, auditable relationship proposal. It deliberately does not
 * derive a relation from tense/aspect or turn either proposal into a judgment.
 */
export async function buildIsaiahPassageRelationships(repoRoot) {
  const source_window = [...await loadSourceVerses(repoRoot, { book: "Isaiah", chapter: 52, firstVerse: 13, lastVerse: 15 }), ...await loadSourceVerses(repoRoot, { book: "Isaiah", chapter: 53, firstVerse: 1, lastVerse: 12 })];
  const start = buildPropositions(await loadPassage(repoRoot, { book: "Isaiah", chapter: 52, firstVerse: 13, lastVerse: 15 }));
  const targetAnalysis = buildPropositions(await loadPassage(repoRoot, { book: "Isaiah", chapter: 53, firstVerse: 4, lastVerse: 6 }));
  const later = buildPropositions(await loadPassage(repoRoot, { book: "Isaiah", chapter: 53, firstVerse: 7, lastVerse: 12 }));
  const find = (items, id) => {
    const found = items.propositions.find(item => item.proposition_id === id);
    if (!found) throw new Error(`Missing expected canonical proposition: ${id}`);
    return found;
  };
  // This is a proposed anchor, not a conclusion that its content is predictive.
  const anchor = find(start, "isa_52_13_2305201300210030_p1");
  const considered = find(targetAnalysis, "isa_53_04_2305300400720080_p1");
  const wandered = find(targetAnalysis, "isa_53_06_2305300600110060_p1");
  const turned = find(targetAnalysis, "isa_53_06_2305300600410050_p1");
  const relationships = [
    relationship({
      type: "proposed_establishes_predictive_announcement",
      source: anchor,
      target: null,
      governingScope: { kind: "selected_window_anchor", selected_window: "Isaiah 52:13–53:12", source_text_only: true, note: "No cross-verse syntactic governor is asserted by this record." },
      uncertainty: "Unassessed: this is an analyst-proposed discourse anchor. Its grammatical presentation is not used as an exclusion rule."
    }),
    ...targetAnalysis.propositions.filter(item => item.proposition_id !== considered.proposition_id && item.proposition_id !== wandered.proposition_id && item.proposition_id !== turned.proposition_id).map(item => relationship({
      type: "proposed_contributes_to_announcement",
      source: item,
      target: anchor,
      governingScope: { kind: "selected_window_discourse_relation", selected_window: "Isaiah 52:13–53:12", note: "Connection is proposed from passage placement and source-linked content; it is not inferred merely because the statement is in the window." },
      uncertainty: "Unassessed: contribution has not been determined by a model or human review. Past or completed grammatical presentation does not exclude a contribution."
    })),
    relationship({
      type: "surrounding_or_other_content",
      source: considered,
      target: anchor,
      governingScope: { kind: "evaluation_scope", governing_predicate_word_id: considered.predicate.word_id, governed_complements: considered.complements.map(item => ({ source_text: item.text, source_word_ids: item.word_ids, scope: item.scope })), note: "The descriptions remain content of 'we considered him'; they are not independent narrator assertions." },
      uncertainty: "Unassessed: the evaluative statement may frame the discourse without itself contributing to a predictive announcement. No relationship is inferred from proximity."
    }),
    ...[wandered, turned].map(item => relationship({
      type: "unresolved_relationship",
      source: item,
      target: anchor,
      governingScope: { kind: "selected_window_discourse_relation", selected_window: "Isaiah 52:13–53:12", note: "No explicit cross-proposition governor establishes whether this first-person plural statement supplies background, contribution, or another relation." },
      uncertainty: "Unassessed: retained specifically because source structure does not resolve its relation to the proposed announcement. Grammatical presentation is not an exclusion criterion."
    })),
    relationship({
      type: "surrounding_or_other_content",
      source: find(later, "isa_53_07_2305300700110013_p1"),
      target: anchor,
      governingScope: { kind: "selected_window_context", selected_window: "Isaiah 52:13–53:12", note: "Included as surrounding passage content, not automatically classified as predictive or contributory." },
      uncertainty: "Unassessed: inclusion in the selected passage window alone supplies no predictive relationship."
    })
  ];
  return {
    schema_version: "0.1.0",
    builder_version: PASSAGE_RELATIONSHIP_VERSION,
    selected_discourse_window: { reference: "Isaiah 52:13–53:12", status: "selected_window_not_proven_discourse_boundary" },
    evidence_boundary: "These are local proposed links over canonical source evidence. They are unassessed and separate from saved Jev judgments and canonical propositions.",
    source_window,
    relationships
  };
}

export function validateIsaiahPassageRelationships(graph) {
  const errors = [];
  if (graph.selected_discourse_window.reference !== "Isaiah 52:13–53:12") errors.push("wrong_window");
  if (!graph.relationships.some(item => item.relationship_type === "proposed_establishes_predictive_announcement")) errors.push("missing_announcement_anchor");
  for (const item of graph.relationships) {
    if (item.assessment_status !== "unassessed") errors.push("assessed_relationship");
    if (!item.connection_source_ids.length || !item.governing_scope || !item.uncertainty) errors.push("incomplete_audit_record");
  }
  if (!graph.relationships.some(item => item.relationship_type === "proposed_contributes_to_announcement") || !graph.relationships.some(item => item.relationship_type === "surrounding_or_other_content") || !graph.relationships.some(item => item.relationship_type === "unresolved_relationship")) errors.push("missing_required_relationship_type");
  if (JSON.stringify(graph).match(/non-prophe(?:tic|cy)|excluded.*(?:past|completed)|(?:past|completed).*excluded/iu)) errors.push("tense_exclusion_present");
  return { ok: errors.length === 0, errors };
}
