# Passage-Level Prophecy Analysis Design

## Purpose and boundary

The project objective is to find prophetic statements in Scripture. This layer
will prepare a passage-level, auditable assessment packet after canonical
propositions and preliminary semantic judgments exist. It does **not** assign a
prophecy label, negate one, or alter canonical linguistic data.

Jev distributions remain model judgments. MACULA structure, morphology, and
source words remain linguistic evidence. Neither is silently promoted into a
prophecy conclusion.

## Unit and inputs

The unit is a defined discourse segment, initially a selected passage such as
Isaiah 53:4–6. Its packet links, rather than merges:

- canonical propositions, source words, predicate heads, surface expressions,
  grammatical scope, and unresolved relations;
- current fingerprint-matched semantic results and their complete probability
  distributions;
- a minimal source-text context window selected for the discourse question;
- an explicit record of omitted distant references and the reason they were not
  used as context.

The packet never uses LBF wording as linguistic evidence and never treats an
external `Ref` target as an identity claim merely because it exists.

## Readiness before any passage-level judgment

The builder must first emit one of these non-classifying states for each unit:

- `requires_broader_discourse_context`: the local passage does not establish a
  discourse reference point, speaker frame, or temporal relation needed for a
  contextual assessment.
- `ready_for_contextual_assessment`: the needed source context has been
  selected and its reason recorded; this is not a prophecy result.
- `underdetermined`: the available source evidence and selected context do not
  distinguish a contextual reading.

For Isaiah 53:4–6, all ten propositions currently require broader discourse
context before any anticipated-event assessment. The “we considered him” unit
has the additional constraint that its three descriptions stay inside the
governing evaluation; they cannot become narrator assertions.

## Future contextual questions

When a passage is ready, one bounded contextual request may ask all applicable
questions together. Its target and evidence window must be explicit.

1. **Discourse frame:** Is the proposition directly framed by narrator speech,
   participant speech/thought/evaluation, a condition, or is the supplied
   context underdetermined?
2. **Temporal anchoring:** Relative to the identified discourse reference
   point, does the passage present the target as prior, current/general,
   subsequent, temporally unspecified, or underdetermined?
3. **Candidate assessment:** Does the supplied window support a
   `supported_candidate`, `possible_candidate`,
   `no_support_in_supplied_context`, or `underdetermined` reading? This is a
   model assessment, not canonical evidence or a final theological label.
4. **Discourse function:** Is the target a retrospective depiction, an
   anticipatory announcement, evaluation/testimony, instruction/exhortation,
   another function, or underdetermined? Retrospective depiction may coexist
   with anticipatory communication at the passage level.
5. **Two temporal relations:** Ask separately for time relative to the
   represented speaker and time relative to the communication setting. Either
   may remain underdetermined, and a past-form depiction cannot by itself
   exclude prophetic communication.

Every question must include `underdetermined`. A `none_expressed`
`prospective_mode` result at proposition level only says that no modal
construction was expressed for that target. It is never a non-prophecy
decision. Likewise, `asserted` is textual presentation, not fulfillment or
truth certification.

## Record shape

```text
passage_contextual_assessment (future, dry-run first)
  passage_id
  source_segment { reference range, source word IDs }
  analysis_unit_ids
  canonical_evidence_links
  semantic_judgment_links { request fingerprint, model/version }
  context_additions [{ source text/IDs, reason }]
  omitted_context [{ target IDs, reason }]
  readiness { status, reasons[] }
  questions[] { id, version, target, scope, choices, evidence IDs }
  model_judgments[] { distribution, reported confidence, request fingerprint }
  prophecy_classification: absent
```

Every future result also requires supporting source IDs, governing scope,
unresolved assumptions, and source evidence against the candidate reading.
The current Decisions API choice response cannot itself carry that structured
evidence; until a compatible response format is chosen, those fields remain a
mandatory local review artifact rather than fabricated model output.

The first implementation step is a dry-run packet and review UI for this
shape. It must pass source-scope and context-selection checks before any new
model call. A separately versioned, human-reviewed classification methodology
would be required after that step.
