# Translator data contract

The project contract is [`DATA_CONTRACT.md`](../../DATA_CONTRACT.md).

This application may read and write:

- `translation/{nt|ot}/{book}.md`
- `alignment/{nt|ot}/{book}/`
- the selected book's approval fields in `STATUS.md`, only after explicit,
  named human confirmation of a stage already marked `ready`

It must not contain `translations/`, canonical alignment, approval records,
or release corpora of its own.

It must never infer or automate `done`. Verification and AI cannot approve.
It must never publish to `cgv-data`.
