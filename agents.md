Read `DATA_CONTRACT.md` before changing any data, import, export,
alignment, translation, approval, or dataset-loading code.

If a request conflicts with `DATA_CONTRACT.md`, stop and explain the conflict.
Do not work around it.

Never move, copy, regenerate, synchronize, or delete canonical data unless
the task explicitly names the source repository, destination repository,
migration phase, and validation procedure.

When uncertain which copy is authoritative, stop. Do not choose by timestamp,
file size, apparent completeness, or Git history alone.



- This is the only editable source of truth for LBF.
- Never import LBF text or alignment automatically from another repository.
- Never preserve approval after changing its bound translation or alignment.
- Never publish directly into a checked-out cgv-data working tree.
- Export only through the canonical validated publisher.