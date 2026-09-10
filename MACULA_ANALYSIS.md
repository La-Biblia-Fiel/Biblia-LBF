# MACULA Analysis

Status: investigation record, 2026-09-09. This document does not add or alter biblical text, translation, alignment, or canonical LBF data.

## Scope

Only representative files and repository metadata were inspected. The local MACULA Hebrew checkout was read without modification; it is about 2.0 GB, so the inspection used Genesis 1, manifests, mapping files, and pipeline/documentation files rather than batch-processing the corpus.

| Dataset | Local path | Role |
| --- | --- | --- |
| MACULA Hebrew | `source/hebrew/macula-hebrew-main/` | Canonical OT syntax reference |
| MACULA Greek | `/Users/johnwry/Downloads/macula-greek-main/` | Architecture/reference only |
| OSHB | `source/hebrew/OSHB/morphhb/` | OT morphology/text provenance reference |

## Repository inventories

### MACULA Hebrew

The checkout contains 3,906 files.

| Directory | Size | Files | Contents | Classification |
| --- | ---: | ---: | --- | --- |
| `WLC/nodes/` | 724 MB | 930 | Chapter-level nested syntax XML and XInclude master | Derived, canonical MACULA representation |
| `WLC/lowfat/` | 406 MB | 932 | Chapter-level nested word-group XML, CSS, master | Derived from nodes |
| `WLC/tsv/` | 80 MB | 5 | One word-level TSV plus generators/readme | Derived from nodes |
| `WLC/tei/` | 36 MB | 40 | TEI presentation/text XML | Derived/presentation |
| `sources/` | 609 MB | 1,955 | Input corpora/annotations (Groves, OSHB/OpenScriptures, MARBLE, glosses, Clear) | Source inputs |
| `mappings/` | 93 MB | 11 | MACULA–MARBLE mappings and transformations | Derived/supporting provenance |
| `doc/` | 620 KB | — | Documentation | Documentation |
| `pipelines/` | 240 KB | 19 | Transform/query definitions | Build logic |

File extensions are dominated by XML (3,841 files); the remaining relevant forms are TSV (7), XSL (2), XQuery/XQ (2), JSON (4), Python (10), Markdown (15), and a documentation PDF. The `WLC` outputs are generated/combined representations; the `sources/` tree is the source-material area. This is confirmed by the README and transformation scripts, not inferred from size.

| Need | Representative file | What it demonstrates |
| --- | --- | --- |
| Nodes | `WLC/nodes/01-Gen-001.xml` | `<Sentences> → <Sentence> → <Trees> → <Tree> → <Node>` hierarchy |
| Lowfat | `WLC/lowfat/01-Gen-001-lowfat.xml` | `<sentence>`, recursive `<wg>`, terminal `<w>` |
| TSV | `WLC/tsv/macula-hebrew.tsv` | One terminal per row, morphology and annotation fields |
| TEI | `WLC/tei/` | Text-oriented TEI output, not the syntax authority |
| Mapping | `mappings/tsv/macula_to_marble_map.tsv` | MACULA terminal ID to MARBLE identifier relation |
| Source syntax | `sources/GrovesCenter/nodes/whs420nom_1c001.xml` | Upstream Westminster Hebrew syntax material |
| Documentation/build | `README.md`, `WLC/tsv/README.md`, `mappings/README.md` | Representation and mapping provenance |

### MACULA Greek

The local checkout contains 272 files and two parallel edition directories.

| Directory | Size | Content | Classification |
| --- | ---: | --- | --- |
| `Nestle1904/` | 218 MB | N1904 nodes, lowfat, TEI, TSV, verse-reference table | Derived edition-specific output |
| `SBLGNT/` | 238 MB | SBLGNT nodes, lowfat, TEI, TSV | Derived edition-specific output |
| `sources/` | 122 MB | Clear annotations/mappings, Logos SBLGNT, MARBLE, Door43 data | Source/support inputs |
| `pipelines/`, `mappings/`, `doc/` | under 1 MB | Transformations and treebank documentation | Build logic/documentation |

Each edition has 27 book XML files in each of `nodes`, `lowfat`, and `tei`, and one TSV. Representative files are `Nestle1904/nodes/01-matthew.xml`, `Nestle1904/lowfat/01-matthew.xml`, `Nestle1904/tei/01-matthew.xml`, and `Nestle1904/tsv/macula-greek-Nestle1904.tsv`.

The important source/derived distinction is strict for this project: both MACULA Greek trees are reference analyses, never an NT text source.

## Common node model

### Nested `nodes`

Both projects represent a syntax tree by literal XML nesting. A sentence is not constrained to one verse: the N1904 Matthew tree has `Sentence ref="MAT 1:2!1-1:6!7"`. A parent is the enclosing `Node`; child order is document order. There is no separate `parent_id` attribute because the XML tree is the parent relation.

Non-terminal nodes use `Cat`, `Rule`, `Head`, and a `nodeId`; Greek nodes also commonly carry zero-based `Start` and `End` terminal offsets. Terminal nodes carry an `xml:id`, a verse-token `ref`, lexical/morphological payload, and a `nodeId`. Hebrew terminals have an inner `m` morphology element; Greek terminals carry those attributes directly on the terminal `Node`.

| Level | Hebrew examples | Greek examples | Meaning |
| --- | --- | --- | --- |
| Sentence/tree | `S` | `S` | sentence/root wrapper |
| Clause | `CL` | `CL` | clause; directly verified in both node files |
| Functions | `S`, `V`, `O`, `O2`, `P`, `PP`, `ADV` | `S`, `V`, `O`, `O2`, `IO`, `P`, `PP`, `ADV`, `VC`, `OC` | functional wrappers |
| Phrases | `np`, `pp`, `vp`, `adjp`, `advp`, `cjp`, `relp` | `np`, `pp`, `vp`, `adjp`, `advp`, `nump` | phrase/word-group structure |
| Terminals | `noun`, `verb`, `prep`, `art`, `cj`, `pron`, `adj`, `rel` | `noun`, `verb`, `det`, `conj`, `pron`, `prep`, `adj`, `adv`, `ptcl` | lexical terminal class |

`Rule` expresses the observed construction/function sequence (for example Hebrew `PP-V-S-O`; Greek `S-V-O`, `Conj13CL`, and `P2CL`). `Head` marks the analysis's head decision. Treat both as analysis data, not recoverable text facts.

### Hebrew clause model and OSHB relation

The requested point is directly verified. In `WLC/lowfat/01-Gen-001-lowfat.xml`, Genesis 1:1 begins:

```xml
<wg class="cl" rule="PP-V-S-O" head="true">
```

The matching node form is:

```xml
<Node Cat="CL" Rule="PP-V-S-O" Head="1" nodeId="0100100100110110">
```

Thus a lowfat `wg[class="cl"]` is the query/display form of a `Node[Cat="CL"]`. It is a clause-level word group, not a label inferred from the verse.

Hebrew terminal identity is `xml:id`, e.g. `o010010010011`. The same terminal has a human reference such as `GEN 1:1!1` and a source-oriented `morphId` such as `010010010011`. The direct OSHB linkage is verified: `sources/OpenScriptures/xml/Gen.xml` has the corresponding `<m n="010010010011">`; its `n` is the MACULA `morphId`, and MACULA's `xml:id` is that identifier prefixed with `o`. The terminal is a morpheme: `GEN 1:1!1` is shared by the prefixed preposition and following noun in Genesis 1:1. A consumer must not treat `ref` as a unique terminal key. Preserve the OSHB `m/@n` value as the source morpheme ID, retain the MACULA `xml:id` as a separate syntax-terminal ID, and retain morpheme granularity.

The MACULA-to-MARBLE mapping mechanism is explicit, not positional. `mappings/morpheme-mappings.xml` and `mappings/tsv/macula_to_marble_map.tsv` relate MACULA `xml:id` values to MARBLE IDs and document one-to-many/many-to-one cases, Qere/Kethiv handling, and non-physical articles. It is a distinct mapping from the direct OSHB `m/@n → morphId` linkage. The terminal's nested `m` includes `oshb-strongs`; it is lexical metadata, not the OSHB morpheme ID. The future OT dataset must retain both the OSHB source morpheme ID and the MACULA terminal identifier.

### Lowfat model

Lowfat retains XML nesting but normalizes non-terminals to `wg` and lexical leaves to `w`. Parentage is the enclosing `wg`; sibling order is document order. It does **not** put a persistent ID on each word group in the examined files, so it is not a flat relational table despite the name. It is easier to query/display because function is usually a `role` on a descendant group or word and grammatical class is a lowercase `class`.

For Genesis 1:1, the clause is `wg[class="cl"]`, its prepositional phrase is `wg[role="pp"][class="pp"]`, and the verb leaf has `role="v"`. Terminal word IDs are retained. Greek lowfat follows the same pattern: `wg[class="cl"]`, lower-case class, terminal `xml:id`, `ref`, `after`, and morphology/semantic fields.

Flattening is partial: intermediate wrappers such as `S → np` and `V → vp` are collapsed, but word-group nesting, word order, and terminal links remain. It does not provide stable group IDs or explicit parent IDs, so a reproducible lowfat export needs deterministic node IDs if it must round-trip or support relational joins.

### TSV model

The Hebrew TSV starts with `xml:id`, `ref`, `class`, `text`, `transliteration`, `after`, lexical/morphology fields, then semantic fields such as `frame`, `subjref`, and `participantref`. The Greek TSV starts with `xml:id`, `ref`, `role`, `class`, `type`, then lexical/morphology fields, semantic domain, frame, subject reference, and referent.

TSV retains terminal identity, reference, order, surface/whitespace, lemma, POS/class, raw morphology, decomposed morphology, and many semantic annotations. It loses every non-terminal node: phrase span, parentage, node rules, head flags, clause membership, and clause nesting. It is sufficient for word morphology and word-to-verse mapping, but not sufficient by itself for word-to-clause mapping, clause hierarchy, or syntactic relations. A terminal `role` cannot reconstruct the tree.

### Text, whitespace, and annotations

Punctuation is not a standalone syntax signal. It appears within terminal `Unicode` / lowfat `unicode` in N1904, within Hebrew terminal unicode, or as TEI `pc` elements. Spacing is modeled by `after`; absent `after` does not license guessed whitespace. TEI is appropriate for readable text/punctuation but is not the canonical syntax structure.

Terminal payload demonstrates the desired layer separation, although upstream XML stores it together: surface/normalized form, lemma, POS, raw morphology/decomposed features, Strong's, gloss/transliteration, Louw–Nida/domain/sense fields, Frame, and participant links (`Ref`, `SubjRef`). The future dataset should separate these named layers rather than copy the mixed XML attribute layout unchanged.

## Comparison and implication

Hebrew and Greek share the three output views and the basic `Sentence → CL → phrase/function → terminal` architecture. Both use nested nodes as the full analysis, lowfat as an easier nested projection, and TSV as a terminal projection. Both use edition-specific terminal IDs and semantic fields.

They differ in source text and linguistic inventory. Hebrew terminals can be morpheme-level and uses labels such as `cj` and `om`; Greek is normally word-level and distinguishes `det`, `conj`, `IO`, `VC`, `OC`, and `ptcl`. The Greek SBLGNT README records migration from N1904 analysis where words could map, with `status="unmapped"` / `status="refs-mapped"` elsewhere. That confirms that syntax is edition-bound and must not be copied blindly onto TR1894.

## Recommended reproducible inspection set

1. Hebrew: `README.md`, Genesis 1 nodes/lowfat, TSV header and Genesis rows, mapping README and map TSV.
2. Greek: root README, `SBLGNT/README.md`, N1904 Matthew nodes/lowfat/TEI/TSV, and `sources/Clear/mappings/`.
3. TR1894: the provenance files and Matthew sample described in `SOURCE_MAPPING.md` and `MATTHEW_1_1_5_PROTOTYPE.md`.

No full-corpus transformation is warranted until the prototype schema has been approved and tested against text differences.
