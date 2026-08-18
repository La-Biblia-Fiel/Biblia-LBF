# Biblia-LBF Data Contract

Status: normative  
Architecture: `docs/architecture/CGV_DATA_ARCHITECTURE.md`

## Purpose

`Biblia-LBF` is the sole editable source of truth for La Biblia Fiel. It owns translation text, tokenization, source-to-target alignment, review state, approval records, translation decisions, and the deterministic exporter that creates publishable artifacts.

## Owned data

- Canonical LBF translation records.
- Stable verse, source-token, and target-token identifiers.
- LBF alignments, including human and machine-draft links.
- Translation and alignment review records.
- Terminology decisions and translation notes.
- Project schemas, validators, migrations, and exporter.
- Release declarations that identify the approved scope.

## Required invariants

- Every editable LBF verse exists exactly once in this repository.
- Every editable LBF alignment exists exactly once in this repository.
- Verse IDs use canonical book codes, for example `TIT.1.1`.
- Token IDs are persisted and never silently regenerated from array position.
- Alignments reference token IDs, not character offsets or UI positions.
- Translation changes increment the translation revision and invalidate translation and alignment approval for the affected verse.
- Alignment changes increment the alignment revision and invalidate alignment approval.
- Approval identifies the exact translation and alignment revisions, approver, and timestamp.
- Machine-produced translation or alignment remains `draft` until human approval.
- Canonical files validate against the repository schemas before merge.

## Allowed writes

Writes may originate from:

- reviewed pull requests;
- `cgv-translator` through the repository adapter;
- explicit, reviewed migration tools.

All accepted writes must become Git commits. A database, local cache, or application state must never become a competing source of truth.

## Publication

Publication is one-way:

```text
Biblia-LBF -> validate -> export -> publisher PR -> cgv-data
```

The exporter must:

- read only committed canonical project data;
- write to a clean staging directory;
- be deterministic;
- include the exact source commit SHA;
- validate output against distribution schemas;
- publish LBF text and alignment as one atomic version;
- refuse incomplete, stale, or unapproved release scope.

This repository must never import changes back from `cgv-data` automatically.

## Prohibited content and behavior

- Application code for Reader, Observer, or Compiler. Translator application code is
  permitted under `apps/translator/`, but it must operate on the canonical project data
  and must not contain an independent translation, alignment, approval, or release corpus.
- Hand-edited copies of published `cgv-data` artifacts.
- Silent approval retention after content changes.
- Direct mutation of a `cgv-data` checkout.
- Multiple canonical formats representing the same editable verse.
- Licensed source material whose redistribution is not permitted.

## Translator application

The LBF Translator application may live under `apps/translator/`.

The application must read and write the canonical project data owned by this
repository. It must not maintain a second editable corpus.

Prohibited beneath `apps/translator/`:

- `translations/` or another complete Bible-text tree;
- canonical alignment files;
- canonical approval or review records;
- canonical release files;
- hand-maintained copies of project data.

Minimal test fixtures are allowed only under `apps/translator/tests/fixtures/`.
They must be clearly labeled noncanonical and contain only the smallest data
needed for a test.

The location of application code does not change data ownership. Canonical
translation, alignment, review, and approval records remain under the project's
designated canonical directories.

## Pull-request gate

CI must reject a change when schemas fail, IDs collide, references are missing, text and alignment revisions disagree, approvals are stale, or the exporter is not reproducible.

