# Translation pipeline

This is how Spanish is produced. `STATUS.md` and `tools/verify.py` do not
decide a verse.

One verse at a time, from a source packet. NT is **TR1894**. OT is
**OSHB/WLC + Paleo/AHRC**. Protestant verse numbers only.

## Default: Cursor Auto, Sonnet when questionable

Cursor Auto drafts and audits. That is the normal path. It does not call
GPT or Grok.

Sonnet steps in only when the verse is questionable:

- local lint hits a known failure (vosotros, parir, dual stones as a stool)
- the Auto audit fails or warns
- the draft has an uncertainty, an added concept, or a dropped unit

A clean Auto pass does not go to Sonnet. After Sonnet, Auto audits that
Spanish once. If it is still questionable, the verse is parked.

```sh
python3 tools/pipeline/run_chapter.py exodo 1
```

That writes request JSON under `pipeline/` and a chapter queue. For each
waiting item, Cursor reads the request, follows `system` and `user`, and
writes only the JSON object to the reply path. Use Auto when `model` is
`cursor-auto`. Use Sonnet when `model` is `sonnet`. Then run the chapter
again. Replies already on disk are ingested, and the next request is written.

Nothing in this path writes `translation/*.md` or `STATUS.md`.

`finish_book_apply.py` copies passed Spanish into `translation/` when you
choose to apply a finished chapter queue. It still does not sign the book.
Prefer the Sonnet text when Sonnet ran; otherwise the Auto draft.

## Paid path

GPT and Grok stay available when you explicitly ask. They are not the
default.

```sh
python3 tools/pipeline/run_chapter.py exodo 1 --api
python3 tools/pipeline/draft_gpt.py exodo 1 16
python3 tools/pipeline/audit_grok.py exodo 1 16 \
  --candidate-file pipeline/ot/exodo/exodo-1-16.draft-gpt56.json --label gpt56
python3 tools/pipeline/polish_sonnet.py exodo 1 16
```

`--full` asks Sonnet for every verse. Leave it off unless you mean to.

## Spanish already in translation/

`audit_translation.py` checks Spanish already in `translation/*.md`.
Default is also Cursor Auto. Paid xAI is `--xai`.

```sh
python3 tools/pipeline/audit_translation.py genesis 1
python3 tools/pipeline/audit_translation.py genesis 1 --mode ingest
python3 tools/pipeline/test_source_packet.py
python3 tools/pipeline/test_cursor_auto.py
```

Spanish: current Latin American (`tú` / ustedes). Not Spain *vosotros*.
Proper names: `translation/PROPER_NAMES.md`.
יהוה → Jehová; אלהים as God → Dios.
