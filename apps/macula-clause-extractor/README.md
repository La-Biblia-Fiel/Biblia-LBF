# MACULA Clause Extractor

A local, read-only extraction layer for MACULA Hebrew `WLC/nodes` and the
corresponding LBF Spanish verse. Its first supported passage is Isaiah 53.

It treats `Cat="CL"` as MACULA's linguistic clause unit, retains nesting,
node IDs, word metadata, compact syntax, participant references, and source
provenance. It does not change `translation/`, `alignment/`, or `STATUS.md`.
The displayed cross-language alignment is deliberately `not_checked`: LBF's
Spanish verse and MACULA Hebrew must never be silently substituted or forced
into a token match.

## Run

```sh
cd apps/macula-clause-extractor
npm test
node cli.js 4 6 > /tmp/isaiah-53-clauses.json
npm run propositions -- --book Isaiah --chapter 53 --start 4 --end 6 --show-propositions
npm run jev:dry-run -- --book Isaiah --chapter 53 --start 4 --end 6 --output /tmp/isaiah-53.jev-state.json --show-sizes
npm start
```

Open <http://127.0.0.1:1435/>. The browser accepts any supported Protestant
Old Testament book, chapter, and verse range for which local LBF and MACULA
node files exist. Isaiah 53:4–6 is the tested reference fixture.

Use `--output /tmp/isaiah-53.propositions.json` with the proposition command
to serialize a separate derived proposition file. It never overwrites raw
clause JSON or canonical LBF data.

The proposition builder uses a structural rule: a `CL` with a direct predicate
is emitted as a proposition; a clause with nested `CL` children but no direct
predicate is retained as a `container`; and a non-predicational leaf `CL` is
retained as `uncertain`. This preserves the raw tree while preventing container
nodes from being sent downstream as duplicate analytical units.

The browser's primary result and `proposition-cli.js` output are canonical
analysis documents: they contain both `clauses` (the preserved normalized
MACULA evidence) and the separately derived `propositions` and
`structural_nodes` fields. `cli.js` remains available for raw extraction only.

## Jev State Builder

`jev-state-cli.js` creates deterministic dry-run requests only. It never calls
a model or reads an API key. Every canonical proposition becomes one exact,
reviewable OpenRouter Decisions API body for the pinned
`typesafe/jev-1.13` model: compact source evidence is in `state`, and every
applicable question is a fixed-choice `choice` decision with an
`underdetermined` option. Request fingerprints, source provenance, question
versions, and empty per-question probability-distribution contracts stay in
`local_record`; they are not sent to the model. The browser exposes the same
review data at `/api/jev-state`.

## Passage-level analysis design

[`PASSAGE_LEVEL_ANALYSIS.md`](PASSAGE_LEVEL_ANALYSIS.md) defines the next,
still dry-run-only layer: an auditable contextual assessment packet for a
passage. It preserves semantic uncertainty, keeps governed material in its
source scope, and contains no prophecy classification. In particular,
`none_expressed` for a local prospective-mode question is never evidence that
a proposition is non-prophetic.

`.env` is ignored. If a paid pilot is explicitly authorized later, place an
OpenRouter key only in that local file as `OPENROUTER_API_KEY=...`; do not put
it in source code, exports, or a terminal transcript.

## Local Ollama / Nimble pilot

The bounded Nimble pilot is independent of OpenRouter and runs exactly the ten
existing Isaiah 53:4–6 units, sequentially. It probes `/api/version`,
`/api/tags`, and `/api/show`; uses `/api/tokenize` for an exact per-request
preflight when that endpoint is supported; and never truncates a request. If
tokenization is unavailable, the record says so and retains a byte-based
estimate rather than claiming an exact count. Each attempt, including failures
and malformed responses, is stored locally under the ignored
`var/ollama-systemone-pilot/` directory. A matching prior attempt is never
automatically repeated.

Run this on the Mac hosting Ollama:

```sh
cd /Users/johnwry/Nextcloud/Documents/GitHub/Biblia-LBF/apps/macula-clause-extractor
npm run ollama:pilot -- --endpoint http://localhost:11434/v1/systemone --model nimble
```
