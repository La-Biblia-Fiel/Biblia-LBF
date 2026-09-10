# Source Mapping and Provenance

Status: design/investigation record, 2026-09-09. This file sets no completed translation or alignment status.

## Authority map

```text
OT text/morphology: OSHB ──┐
                            ├── OT syntax dataset
OT syntax analysis: MACULA Hebrew ─┘

NT text: Biblia-LBF/source/greek/TR1894/tr1894.txt ─┐
NT morphology: TR-aligned data ─┼── TR1894 syntax dataset
NT syntax decisions: documented ─┘

MACULA Greek (N1904/SBLGNT) ── reference, comparison, validation only
```

The direction matters. MACULA Greek may suggest a construction to review, but it must never furnish the NT text layer, token identity, or an undocumented clause boundary for TR1894.

## OT: OSHB → MACULA Hebrew

| Layer | Authoritative value | Required persisted identity | Notes |
| --- | --- | --- | --- |
| Text | OSHB/WLC source representation selected by project policy | source system and token/morpheme ID | Do not replace source identity with a display index. |
| Morphology | OSHB native morphology | raw OSHB code plus normalized features if derived | Preserve native code unchanged. |
| Syntax | MACULA Hebrew nodes | MACULA `xml:id` terminal link and syntax-node provenance | `Node[Cat="CL"]` / `wg[class="cl"]` supply existing OT clause analysis. |
| Cross-source mapping | MACULA mapping files | explicit mapping record and cardinality | Never infer a map from ordinal position; Qere/Kethiv and morphemes prevent that. |

MACULA Hebrew exposes a direct OSHB morpheme linkage: OSHB/OpenScriptures `<m n="010010010011">` becomes MACULA `morphId="010010010011"` and terminal `xml:id="o010010010011"`. These identities are mechanically related but represent distinct layers; persist the original OSHB `m/@n` as the source morpheme ID and the MACULA `xml:id` as the syntax-terminal identifier.

## NT: TR1894 → proposed syntax

### Available machine-readable TR resources

The authoritative NT source is the local project directory
`source/greek/TR1894/`. Within it, `tr1894.txt` is the canonical Unicode text
layer; the other files in that directory are supporting text and morphology
resources. The current `tr1894.txt` SHA-256 is
`9d0dba729aaee22e0054482b0385b58a8365107a9f9621fd2c8535bfd1b8ebcc`.

| Resource | Format | Content | Identifier situation |
| --- | --- | --- | --- |
| `tr1894.txt` | pipe-delimited verse text, Unicode Greek | **Canonical local TR1894 text**, verse-level accents and punctuation | Stable verse record `MAT.1.1`; no word IDs |
| `scrivener-textonly/*.SCV` | beta-code plain text | Robinson distribution of Scrivener 1894 text | Book/chapter/verse labels; no word IDs or morphology |
| `robinson-parsed/*.UTR` | beta-code parsed text | Token sequence, Strong's, Robinson morphology | Book/chapter/verse labels and order; no explicit token IDs |
| `honza/textus-receptus` | flat/nested JSON, XML, YAML | Accented text, grammar, Strong's, dictionary form, glosses | Ordered word objects; inspect and pin a commit before production use |

The local source records pinned upstream commits: `greektext-scrivener` `6049a43b135ed870f843b83eb6a04764fc796678` (text-only) and `greektext-textus-receptus` `7fd4d02c3e5adebd379ebfbc824040820dde10fc` (parsed). Its README correctly warns that parsed Robinson material is a helper and that text differences must be evaluated against Scrivener 1894.

The user-named `honza/textus-receptus` repository advertises 1894 Scrivener text in `gnt.flat.{json,xml,yaml}` and `gnt.nested.{json,xml,yaml}`, with grammar, Strong's, lemma/dictionary form, and glosses. It remains external research/reference material only: it is not an NT text source for this dataset unless the user explicitly changes this source decision. No files from it have been imported by this investigation.

### Stable TR token rule

TR source files do not expose a universal stable terminal ID. Generate one deterministically from fixed Protestant reference and source-token ordinal:

```text
<BOOK>.<chapter>.<verse>.w<3-digit ordinal>
MAT.1.1.w001
MAT.1.1.w008
```

Each token must also store `source_ref`, `source_ordinal`, `source_revision`, exact `surface_source`, optional reversible `surface_unicode`, and a source file/record/token `source_locator`. An ID is stable only within its pinned source revision and documented tokenization policy. Do not renumber it to match MACULA, and do not make punctuation into a word token merely to make another edition's counts fit.

### TR text/morphology reconciliation gate

The local sources deliberately supply different capabilities: Scrivener text-only is the direct text witness; UTR supplies token-level morphology. Before production, make one versioned reconciliation table:

| Outcome | Action |
| --- | --- |
| Same TR token boundary and reading | Bind UTR morphology to the TR token; record both locators. |
| Same reading, representational difference only | Record the reversible normalization rule; preserve source surfaces. |
| Alternate reading, insertion/deletion, or split/merge | Create an explicit one-to-one/one-to-many mapping and require human review. Do not borrow another edition's word. |
| Unresolved | Leave morphology/linkage unresolved and block the affected syntax export. |

This is an engineering gate, not authorization to import automatically. It protects TR1894 as immutable NT text authority.

## MACULA Greek: comparison only

A MACULA Greek ID such as `n40001005005` belongs to its edition. If retained, it must occur only in a reference record:

```json
{
  "reference_dataset": "macula-greek/Nestle1904",
  "reference_revision": "pinned checkout revision",
  "reference_terminal_id": "n40001005005",
  "relation": "comparison-only",
  "basis": "same reference position; text differs"
}
```

A reference link is not a token identity mapping and confers no syntax approval. It is permitted only after a TR tokenization comparison records the relationship.

## Reproducibility requirements

Every transformation needs a manifest containing input path, commit/content hash, command/version, output hash, and unresolved mapping count. A TR verse must reconstruct from the local `tr1894.txt` text layer alone, and every syntax terminal must reach a TR `token_id` without consulting MACULA Greek. `schema/tr1894-syntax.schema.json` is the proposed machine-checkable boundary for that separation.
