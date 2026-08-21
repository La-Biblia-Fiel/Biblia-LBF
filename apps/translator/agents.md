Follow [`AGENTS.md`](../../AGENTS.md) and [`DATA_CONTRACT.md`](../../DATA_CONTRACT.md).

This application edits Biblia-LBF. It does not own translation data.
Never create an independent corpus under `apps/translator/`.
Never write directly to `cgv-data`.
Never infer `done`. Write it only from Translator's explicit named-human
approval control after the selected stage is canonically `ready`.
Machine suggestions cannot become finished work.
Translator may create a selected-book commit only through its explicit human
**Review & Commit** confirmation. Validate first, show the exact files, refuse
pre-staged work, and never include another book's changes.
