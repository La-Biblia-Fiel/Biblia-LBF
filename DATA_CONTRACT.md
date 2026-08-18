# Biblia-LBF Data Contract

Status: normative

## Purpose

`Biblia-LBF` is the only editable source of truth for La Biblia Fiel.
It owns the Spanish text, the source-to-Spanish alignment, and the
record of whether that work is finished.

Working format:

- one Markdown file per book for Spanish
- one reverse-links file per book for alignment
- `STATUS.md` for finished

## Canonical homes

| Data | Path |
| --- | --- |
| Spanish | `translation/{nt\|ot}/{book}.md` |
| Alignment | `alignment/{nt\|ot}/{book}/{book}-reverse-links.json` |
| Status | `STATUS.md` |
| Sources | `source/` |

Every editable verse exists once. Every editable alignment exists once.
Verse labels are Protestant. Token IDs are persisted. Alignments name
token IDs, not character offsets as the source of truth.

## Finished

`STATUS.md` is the only ledger. Four states:
`none` | `draft` | `ready` | `done`.

| State | Who writes it | Meaning |
| --- | --- | --- |
| `none` | `python3 tools/verify.py` | No real file |
| `draft` | a person, or `verify.py` | Work exists. Not complete |
| `ready` | `python3 tools/verify.py` only | Checks passed. Awaiting approval |
| `done` | a named human only | Approved |

`done` requires a name, a date, and a passing `python3 tools/status.py`.
`verify.py` never writes `done`. `status.py` never writes a state.

A book is finished only when translation and alignment are both `done`.
Machine-produced Spanish or alignment stays `draft`.

If a `ready` file fails the checks, `verify.py` returns it to `draft`.
If a `done` file changes, clear that signature yourself. It returns to `draft`.

## Translator application

`apps/translator/` may exist as an editor. It must read and write the
canonical homes above. It must not keep `translations/`, canonical
alignment, or approval records of its own.

## Publication

```text
Biblia-LBF → validate → export → publisher PR → cgv-data
```

This repository never imports LBF text or alignment back from `cgv-data`.
It never publishes by copying into a checked-out `cgv-data` working tree.

## Prohibited

- A second editable copy of the same verse or alignment
- Automatic import from another repository
- Silent retention of `done` after the bound text or alignment changes
- Machine zip, gloss DP, or auto-zip presented as finished alignment
- MT verse labels
- Direct mutation of `cgv-data`
- Reader, Observer, or Compiler application code in this repository
