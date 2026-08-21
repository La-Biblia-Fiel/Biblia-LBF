# Translator

Editor for La Biblia Fiel. It does not own the text.

Spanish is in `translation/`. Alignment is in `alignment/`.
Finished is in `STATUS.md`. This app records `done` only when a named human
explicitly approves a stage that the canonical verifier marked `ready`.

## Run

```sh
npm start
```

Then open `http://127.0.0.1:1424/`.

Optional local suggestions (LM Studio or another provider) may draft Spanish.
They cannot verify, approve, or publish.

Phrase-by-phrase work stays in the translation view. **Finish book** opens a
separate finalization view that runs the canonical verifier, records explicit
human approvals, presents the selected book's exact file list for a
human-confirmed source commit, calls the canonical exporter, and—after a
second explicit confirmation—calls the canonical publisher to create the
local `cgv-data` branch. It never includes unrelated work, pushes, opens a
pull request, or bypasses an exporter or publisher refusal.

During alignment, **Continue alignment** opens the next unfinished phrase.
Review its unit-to-source links, correct any wrong unit, then use **Confirm
entire phrase** to record that visible phrase as hand-reviewed and advance.

## Project rules

- [`WORKFLOW.md`](../../WORKFLOW.md) — how to translate and align
- [`DATA_CONTRACT.md`](../../DATA_CONTRACT.md) — where data may live
- [`STATUS.md`](../../STATUS.md) — what is finished

```sh
python3 ../../tools/status.py
```
