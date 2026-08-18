# Translator

Editor for La Biblia Fiel. It does not own the text.

Spanish is in `translation/`. Alignment is in `alignment/`.
Finished is in `STATUS.md`. This app cannot mark a book `done`.

## Run

```sh
npm start
```

Then open `http://127.0.0.1:1424/`.

Optional local suggestions (LM Studio or another provider) may draft Spanish.
They cannot verify, approve, or publish.

## Project rules

- [`WORKFLOW.md`](../../WORKFLOW.md) — how to translate and align
- [`DATA_CONTRACT.md`](../../DATA_CONTRACT.md) — where data may live
- [`STATUS.md`](../../STATUS.md) — what is finished

```sh
python3 ../../tools/status.py
```
