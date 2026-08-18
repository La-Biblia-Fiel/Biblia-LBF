Read `DATA_CONTRACT.md` and `WORKFLOW.md` before changing translation,
alignment, status, import, export, or dataset-loading code.

If a request conflicts with `DATA_CONTRACT.md`, stop and explain the conflict.
Do not work around it.

This repository is the only editable source of truth for LBF.
Work only here. Do not open or write `cgv-reader`. `cgv-data` is output only.

Never import LBF text or alignment automatically from another repository.
Never move, copy, regenerate, synchronize, or delete canonical data unless
the task names the source repository, destination repository, migration
phase, and validation procedure.

When two copies differ, stop. Do not choose by timestamp, file size,
apparent completeness, or Git history alone.

Spanish lives in `translation/`. Alignment lives in `alignment/`.
Finished lives only in `STATUS.md`. States: `none` | `draft` | `ready` | `done`.
`python3 tools/verify.py` may write `ready`. Never write `done` for the user.
Never infer `done`.

Never use MT numbering. Always Protestant.
Never run machine zip, gloss DP, or whole-book auto-align.
Never present auto-zip or gloss as finished alignment.

Never preserve `done` after changing the bound translation or alignment.
Never publish directly into a checked-out `cgv-data` working tree.
Export only through the canonical validated publisher.
