# Matthew 1:1–5 TR1894 Syntax Prototype

Status: manual inspection prototype, 2026-09-09. It models a small sample for review; it does not create a complete NT corpus or claim final syntax analysis.

## Sources and method

* Authoritative text surface/punctuation: `source/greek/TR1894/tr1894.txt`.
* Token morphology/Strong's: `source/greek/TR1894/robinson-parsed/MT.UTR`.
* Reference syntax/text comparison: MACULA Greek N1904 Matthew files in `/Users/johnwry/Downloads/macula-greek-main/Nestle1904/`.

The fixture binds its source reconstruction to the current SHA-256 of local `tr1894.txt`: `9d0dba729aaee22e0054482b0385b58a8365107a9f9621fd2c8535bfd1b8ebcc`. UTR morphology is provisionally attached pending the reconciliation gate in `SOURCE_MAPPING.md`. Its beta-code source surface is retained in the source record; the Unicode below follows the authoritative local TR text. No N1904 token or ID is a TR identity.

## Text, token IDs, and morphology

### Matthew 1:1

> Βίβλος γενέσεως Ἰησοῦ Χριστοῦ, υἱοῦ Δαβὶδ, υἱοῦ Ἀβραάμ.

| ID | Surface | Morphology | Prototype role |
| --- | --- | --- | --- |
| `MAT.1.1.w001` | Βίβλος | N-NSF | head noun |
| `MAT.1.1.w002` | γενέσεως | N-GSF | genitive complement |
| `MAT.1.1.w003` | Ἰησοῦ | N-GSM | appositional/genitive chain |
| `MAT.1.1.w004` | Χριστοῦ | N-GSM | appositional/genitive chain |
| `MAT.1.1.w005` | υἱοῦ | N-GSM | genitive relation |
| `MAT.1.1.w006` | Δαβὶδ | N-PRI | genitive relation |
| `MAT.1.1.w007` | υἱοῦ | N-GSM | genitive relation |
| `MAT.1.1.w008` | Ἀβραάμ | N-PRI | genitive relation |

```text
MAT.1.s001 (sentence)
└── MAT.1.s001.c001 (clause, verbless; P2CL)
    └── MAT.1.s001.p001 (np)
        ├── w001 Βίβλος
        └── p002 (genitive/apposition chain: w002–w008)
```

### Matthew 1:2

> Ἀβραὰμ ἐγέννησε τὸν Ἰσαάκ· Ἰσαὰκ δὲ ἐγέννησε τὸν Ἰακώβ· Ἰακὼβ δὲ ἐγέννησε τὸν Ἰούδαν καὶ τοὺς ἀδελφοὺς αὐτοῦ·

| ID range | Tokens (surface — raw morphology) | Clause/function |
| --- | --- | --- |
| `w001–w004` | Ἀβραὰμ—N-PRI; ἐγέννησε—V-AAI-3S; τὸν—T-ASM; Ἰσαάκ—N-PRI | c001: S–V–O |
| `w005–w009` | Ἰσαὰκ—N-PRI; δὲ—CONJ; ἐγέννησε—V-AAI-3S; τὸν—T-ASM; Ἰακώβ—N-PRI | c002: S–V–O; δὲ coordinates |
| `w010–w018` | Ἰακὼβ—N-PRI; δὲ—CONJ; ἐγέννησε—V-AAI-3S; τὸν—T-ASM; Ἰούδαν—N-ASM; καὶ—CONJ; τοὺς—T-APM; ἀδελφοὺς—N-APM; αὐτοῦ—P-GSM | c003: S–V–O, coordinated object NP |

```text
c003
├── s: np(w010)
├── v: vp(w012)
└── o: np
    ├── np(w013–w014: τὸν Ἰούδαν)
    ├── conjunction(w015: καὶ)
    └── np(w016–w018: τοὺς ἀδελφοὺς αὐτοῦ)
```

### Matthew 1:3

> Ἰούδας δὲ ἐγέννησε τὸν Φάρες καὶ τὸν Ζαρὰ ἐκ τῆς Θάμαρ· Φάρες δὲ ἐγέννησε τὸν Ἐσρώμ· Ἐσρὼμ δὲ ἐγέννησε τὸν Ἀράμ·

| ID range | Tokens (surface — raw morphology) | Clause/function |
| --- | --- | --- |
| `MAT.1.3.w001–w011` | Ἰούδας—N-NSM; δὲ—CONJ; ἐγέννησε—V-AAI-3S; τὸν—T-ASM; Φάρες—N-PRI; καὶ—CONJ; τὸν—T-ASM; Ζαρὰ—N-PRI; ἐκ—PREP; τῆς—T-GSF; Θάμαρ—N-PRI | c004: S–V–O–ADV |
| `w012–w016` | Φάρες—N-PRI; δὲ—CONJ; ἐγέννησε—V-AAI-3S; τὸν—T-ASM; Ἐσρώμ—N-PRI | c005: S–V–O |
| `w017–w021` | Ἐσρὼμ—N-PRI; δὲ—CONJ; ἐγέννησε—V-AAI-3S; τὸν—T-ASM; Ἀράμ—N-PRI | c006: S–V–O |

### Matthew 1:4

> Ἀρὰμ δὲ ἐγέννησε τὸν Ἀμιναδάβ· Ἀμιναδὰβ δὲ ἐγέννησε τὸν Ναασσών· Ναασσὼν δὲ ἐγέννησε τὸν Σαλμών·

| ID range | Tokens (surface — raw morphology) | Clause/function |
| --- | --- | --- |
| `MAT.1.4.w001–w005` | Ἀρὰμ—N-PRI; δὲ—CONJ; ἐγέννησε—V-AAI-3S; τὸν—T-ASM; Ἀμιναδάβ—N-PRI | c007: S–V–O |
| `w006–w010` | Ἀμιναδὰβ—N-PRI; δὲ—CONJ; ἐγέννησε—V-AAI-3S; τὸν—T-ASM; Ναασσών—N-PRI | c008: S–V–O |
| `w011–w015` | Ναασσὼν—N-PRI; δὲ—CONJ; ἐγέννησε—V-AAI-3S; τὸν—T-ASM; Σαλμών—N-PRI | c009: S–V–O |

### Matthew 1:5

> Σαλμὼν δὲ ἐγέννησε τὸν Βοὸζ ἐκ τῆς Ῥαχάβ· Βοὸζ δὲ ἐγέννησε τὸν Ὠβὴδ ἐκ τῆς Ῥούθ· Ὠβὴδ δὲ ἐγέννησε τὸν Ἰεσσαί·

| ID range | Tokens (surface — raw morphology) | Clause/function |
| --- | --- | --- |
| `MAT.1.5.w001–w008` | Σαλμὼν—N-PRI; δὲ—CONJ; ἐγέννησε—V-AAI-3S; τὸν—T-ASM; Βοὸζ—N-PRI; ἐκ—PREP; τῆς—T-GSF; Ῥαχάβ—N-PRI | c010: S–V–O–ADV |
| `w009–w016` | Βοὸζ—N-PRI; δὲ—CONJ; ἐγέννησε—V-AAI-3S; τὸν—T-ASM; Ὠβὴδ—N-PRI; ἐκ—PREP; τῆς—T-GSF; Ῥούθ—N-PRI | c011: S–V–O–ADV |
| `w017–w021` | Ὠβὴδ—N-PRI; δὲ—CONJ; ἐγέννησε—V-AAI-3S; τὸν—T-ASM; Ἰεσσαί—N-PRI | c012: S–V–O |

## Clause hierarchy/query rows

`MAT.1.s002` is the coordinated genealogy sentence spanning 1:2–1:6 in MACULA N1904. The prototype ends at 1:5 but retains that sentence-level observation. `c000` is a coordination wrapper, not an independent finite proposition.

| Clause | Parent | Verse | Sequence | Type | Rule | Yield |
| --- | --- | --- | ---: | --- | --- | --- |
| `MAT.1.s002.c000` | — | 1:2–5 | 0 | coordinate | ConjCL | all sample tokens |
| `c001`–`c003` | c000 | 1:2 | 1–3 | verbal | S-V-O | w001–4; w005–9; w010–18 |
| `c004`–`c006` | c000 | 1:3 | 4–6 | verbal | S-V-O(-ADV) | w001–11; w012–16; w017–21 |
| `c007`–`c009` | c000 | 1:4 | 7–9 | verbal | S-V-O | each five-word unit |
| `c010`–`c012` | c000 | 1:5 | 10–12 | verbal | S-V-O(-ADV) | w001–8; w009–16; w017–21 |

## Comparison with MACULA Greek N1904

### What transfers as methodology

The N1904 tree provides a strong representation example: Matthew 1:1 is a `CL` with `ClType="Verbless"` and `P2CL`; Matthew 1:2–1:6 is a coordinated clause tree whose children use `S-V-O` and `S-V-O-ADV`; the word-group model distinguishes subject, verb, object, and PP/adjunct. This supports the proposed tree shape and clause sketch.

### Why N1904 cannot be copied

| Location | TR1894 surface | N1904 MACULA surface | Consequence |
| --- | --- | --- | --- |
| 1:1 word 6 | Δαβὶδ | Δαυεὶδ | Different spelling/reading representation; IDs cannot be shared. |
| 1:3 word 5/12 | Φάρες | Φαρὲς | Accent/spelling representation differs. |
| 1:5 word 5/9 | Βοὸζ | Βόες | Different form; require TR-specific terminal and review. |
| 1:5 word 13/17 | Ὠβὴδ | Ἰωβὴδ | Different form; require TR-specific terminal and review. |

Local TR uses middle dots/stops. N1904 TEI represents punctuation as separate `pc` elements and nodes/lowfat commonly retain it on the preceding terminal. Neither difference changes a word ID or establishes a clause boundary.

UTR morphology broadly agrees with the N1904 reference in this sample (for example `V-AAI-3S` for ἐγέννησε), but that is validation evidence, not permission to copy N1904 lemma or syntax annotations.

## Additional complexity inspection

Matthew 1:18–25 is the recommended next prototype passage. It contains a genitive-absolute participial construction (1:18), infinitives (1:18–19), participles and coordinated material (1:19–20), and reported speech (1:20–23). Matthew 5:19–20 and 5:39–45 offer conditional/relative and coordinated nested constructions. N1904 nodes model analogous structures with nested `CL`, `np`, `vp`, and functional wrappers, but a TR tree must be authored from TR tokens and documented evidence rather than projected from N1904 terminals.

## Before scale-up

1. Pin one canonical TR text representation and normalization policy.
2. Approve the TR↔morphology reconciliation table and unresolved-case policy.
3. Approve the controlled clause/phrase vocabulary.
4. Implement and run validation for tree coverage, parentage, terminal yield, and source reconstruction.
