# Biblia-LBF — agent entry point

Read [`DATA_CONTRACT.md`](DATA_CONTRACT.md) before changing any data, import,
export, alignment, translation, approval, or dataset-loading code.

If a request conflicts with `DATA_CONTRACT.md`, stop and explain the conflict.
Do not work around it.

Never move, copy, regenerate, synchronize, or delete canonical data unless the
task explicitly names the source repository, destination repository, migration
phase, and validation procedure.

When uncertain which copy is authoritative, stop. Do not choose by timestamp,
file size, apparent completeness, or Git history alone.

## What this repository is

This is the **only editable source of truth for LBF**. It owns translation text,
tokenization, source-to-target alignment, review state, approval records,
translation decisions, and the deterministic exporter.

Canonical architecture: [`docs/architecture/CGV_DATA_ARCHITECTURE.md`](docs/architecture/CGV_DATA_ARCHITECTURE.md).

## Hard rules

- Never import LBF text or alignment automatically from another repository.
- Never preserve approval after changing its bound translation or alignment.
- Never publish directly into a checked-out `cgv-data` working tree.
- Export only through the canonical validated publisher.
- Never add Reader, Observer, Compiler, or Translator application code here.
- Every editable verse and every editable alignment exists exactly **once**.
- Alignment references stable token ids — never character offsets, never display
  positions.
- Machine-produced translation or alignment stays `draft` until a human approves
  it. `aiUsed: true` plus an approved status with no human approver is a
  violation, not a shortcut.

## Identity and revision binding

Records carry a `recordId` and revision ids of the form `PREFIX-book-<12 hex>`:

| Prefix | Binds |
| --- | --- |
| `SRC-` | source edition revision |
| `TR-` | translation revision |
| `ALN-` | alignment revision |
| `BOOKREV-` | book review record |
| `RELMAN-` | release manifest |

A release manifest binds all three inputs in `inputRevisionIds` and declares a
sha256 for every artifact. Published text carries its `translation-revision:` in
the file header, and it must equal the manifest's binding. Approval that does not
name the exact revisions it approved is not approval.

## Verse numbering

Source token ids keep the numbering of the source edition. Spanish references use
the Protestant numbering. For some books these differ — Zechariah MT 2:1–4 is
Protestant 1:18–21, and Daniel has its own offsets. An alignment record must
therefore declare its `numbering` basis. A systematic offset is expected; a single
reference resolving to two different source verses is a defect.

## Before you open a pull request

```bash
python3 scripts/check-data-contract.py
```

The check is read-only. It fails on any violation that is not already listed in
`.data-contract-baseline.json`. That baseline is the list of problems that existed
when the check was introduced — shrink it, never grow it. To see the current
findings as a baseline document:

```bash
python3 scripts/check-data-contract.py --emit-baseline
```

Do not edit data to make a check pass. If a check is wrong, fix the check and say
so in the pull request.
