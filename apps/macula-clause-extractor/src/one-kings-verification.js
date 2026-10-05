import { createHash } from "node:crypto";
import { loadPassage, loadSourceVerses } from "./extractor.js";
import { buildPropositions } from "./propositions.js";

const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const ONE_KINGS_VERIFICATION_VERSION = "0.1.0";
export const candidateChoices = {
  supported_candidate: "The supplied context positively supports a predictive announcement: the target communicates circumstances as subsequent to its communication setting.",
  possible_candidate: "Some supplied evidence supports that reading, but a competing reading remains.",
  no_support_in_supplied_context: "The supplied context provides no positive support for that reading. This does not establish non-prophecy.",
  underdetermined: "Missing or ambiguous supplied evidence prevents distinguishing these outcomes."
};

const compact = proposition => ({
  proposition_id: proposition.proposition_id,
  reference: proposition.reference,
  source_text: proposition.source.text,
  source_word_ids: proposition.source.word_ids,
  predicate: {
    predicate_word_id: proposition.predicate.word_id,
    predicate_head: proposition.predicate.text,
    surface_expression: proposition.predicate.surface_expression,
    voice: proposition.predicate.voice
  },
  grammatical_scope: {
    source_rule: proposition.syntax.rule,
    governed_complements: proposition.complements.map(complement => ({ word_ids: complement.word_ids, source_text: complement.text, scope: complement.scope }))
  }
});

function question(caseId, targetLabel) {
  return {
    type: "choice",
    instructions: `Assess only ${targetLabel} in its supplied source scope. Is it a predictive-statement candidate: does it communicate circumstances as subsequent to the communication setting? Do not treat verbal morphology alone as decisive. Choose underdetermined when the supplied evidence does not distinguish the choices.`,
    criteria: candidateChoices
  };
}

/** Creates one no-network, two-case verification request. Local expectations never enter payload. */
export async function buildOneKingsVerification(repoRoot) {
  const sourceWindow = await loadSourceVerses(repoRoot, { book: "1 Kings", chapter: 13, firstVerse: 1, lastVerse: 3 });
  const analysis = buildPropositions(await loadPassage(repoRoot, { book: "1 Kings", chapter: 13, firstVerse: 1, lastVerse: 3 }));
  const proposition = id => {
    const found = analysis.propositions.find(item => item.proposition_id === id);
    if (!found) throw new Error(`Expected canonical proposition is unavailable: ${id}`);
    return found;
  };
  const narrative = proposition("book_13_01_1101300100210100_p1");
  const announcementFrame = [
    proposition("book_13_02_1101300200120070_p1"),
    proposition("book_13_02_1101300200910030_p1")
  ];
  const announcementContents = [
    proposition("book_13_02_1101300201310050_p1"),
    proposition("book_13_02_1101300201920110_p1"),
    proposition("book_13_02_1101300202620050_p1"),
    proposition("book_13_03_1101300301210030_p1"),
    proposition("book_13_03_1101300301420060_p1")
  ];
  const cases = {
    announcement_1ki_13_2_3: {
      case_id: "announcement_1ki_13_2_3",
      target_label: "the announcement in 1 Kings 13:2–3",
      target_kind: "multi-expression announcement",
      target_propositions: announcementContents.map(compact),
      governing_scope: {
        kind: "direct_speech_announced_as_word_of_YHWH",
        source_evidence: announcementFrame.map(compact),
        note: "The five target predications are evaluated as content within this announced speech, not as detached narration."
      },
      context_reason: "Verses 1–3 establish the speaker, the direct-speech frame, and the announced sign without importing later fulfillment material."
    },
    narrative_control_1ki_13_1: {
      case_id: "narrative_control_1ki_13_1",
      target_label: "the ordinary past narrative statement in 1 Kings 13:1",
      target_kind: "single narrative predication",
      target_propositions: [compact(narrative)],
      governing_scope: {
        kind: "narrator_assertion",
        source_evidence: [compact(narrative)],
        note: "This is presented as ordinary narrator discourse, not as the content of the following announcement."
      },
      context_reason: "Verses 1–3 distinguish the verse 1 arrival narrative from the direct speech introduced in verse 2."
    }
  };
  const payload = {
    model: "typesafe/jev-1.13",
    state: {
      assessment_kind: "bounded_predictive_statement_verification",
      source_window: sourceWindow,
      cases,
      evidence_boundary: "Source text and canonical proposition structure are evidence. The response is a model judgment and does not alter canonical data."
    },
    questions: Object.fromEntries(Object.entries(cases).map(([id, item]) => [`${id}:candidate_assessment`, question(id, item.target_label)]))
  };
  const expected_outcomes = {
    announcement_1ki_13_2_3: "supported_candidate",
    narrative_control_1ki_13_1: "no_support_in_supplied_context"
  };
  return {
    payload,
    local_record: {
      builder_version: ONE_KINGS_VERIFICATION_VERSION,
      request_fingerprint: hash(payload),
      expected_outcomes,
      expectations_boundary: "Expected outcomes are local verification criteria and are intentionally absent from the model-facing payload.",
      request_size_bytes: Buffer.byteLength(JSON.stringify(payload), "utf8"),
      token_estimate: { method: "byte_divided_by_4", estimated_input_tokens: Math.ceil(Buffer.byteLength(JSON.stringify(payload), "utf8") / 4), exact_count_available: false, limitation: "A local Jev tokenizer is unavailable; this is a rough byte-based estimate, not an exact token count." }
    }
  };
}

export function validateOneKingsVerification(dryRun) {
  const errors = [], { payload, local_record } = dryRun;
  if (payload.state.source_window.length !== 3 || payload.state.source_window.map(verse => verse.reference).join("|") !== "1 Kings 13:1|1 Kings 13:2|1 Kings 13:3") errors.push("wrong_source_window");
  if (Object.keys(payload.state.cases || {}).length !== 2 || Object.keys(payload.questions || {}).length !== 2) errors.push("wrong_case_or_question_count");
  if (JSON.stringify(payload).includes("expected_outcomes")) errors.push("expectations_leaked_to_payload");
  if (!payload.state.cases?.announcement_1ki_13_2_3?.governing_scope.source_evidence?.length) errors.push("missing_announcement_scope");
  if (payload.state.cases?.narrative_control_1ki_13_1?.governing_scope.kind !== "narrator_assertion") errors.push("missing_narrative_scope");
  for (const item of Object.values(payload.questions || {})) if (item.type !== "choice" || !item.criteria?.underdetermined) errors.push("invalid_choice_question");
  if (!local_record.expected_outcomes || !local_record.request_fingerprint) errors.push("missing_local_verification_data");
  return { ok: errors.length === 0, errors };
}
