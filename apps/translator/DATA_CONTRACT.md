# Translator data contract

The project contract is [`DATA_CONTRACT.md`](../../DATA_CONTRACT.md).

This application may read and write:

- `translation/{nt|ot}/{book}.md`
- `alignment/{nt|ot}/{book}/`

It must not contain `translations/`, canonical alignment, approval records,
or release corpora of its own.

It must never write `done` into `STATUS.md`.
It must never publish to `cgv-data`.
