# Translation pipeline

This is the procedure. One Protestant verse at a time, from a source
packet. NT: **TR1894**. OT: **OSHB/WLC + Paleo/AHRC**.

Cursor Auto drafts and audits. Sonnet steps in only when the verse is
questionable. GPT and Grok are not in this procedure. `STATUS.md` and
`tools/verify.py` do not accept a verse.

Spanish is current Latin American (`tú` / ustedes), not Spain
*vosotros*. Proper names: `translation/PROPER_NAMES.md`.
יהוה → Jehová. אלהים as God → Dios.

## Stations

| Order | Who | When |
| --- | --- | --- |
| 1 | source packet | every verse |
| 2 | Cursor Auto drafts | every verse |
| 3 | local lint | every verse, no model |
| 4 | Cursor Auto audits | lint passed |
| 5 | Sonnet | the verse is questionable |
| 6 | Cursor Auto audits again | only the Spanish Sonnet wrote |

A clean pass stays with Auto. Clean means the audit has no fail and no
warn, and the draft has no uncertainty, added concept, or dropped unit.

Sonnet runs when any of these is true:

- lint hits a known failure (*vosotros*, *parir*, dual stones turned
  into a stool, or another rule in `lint_lib.py`)
- the audit fails or warns
- the draft lists an uncertainty, an added concept, or a dropped unit

After Sonnet, Auto audits that Spanish once. If lint still fails, or
that second audit is still questionable, the verse is parked. Sonnet
does not run again on it.

## Run a chapter

```sh
python3 tools/pipeline/run_chapter.py exodo 1
python3 tools/pipeline/run_chapter.py exodo 1 --from 1 --to 5
```

The script writes under `pipeline/ot/exodo/` (or `pipeline/nt/{book}/`).
It does not write `translation/*.md` or `STATUS.md`. It does not call
GPT, Grok, or Sonnet itself. It writes requests. You answer them, then
run the same command again.

A book is the same loop, chapter by chapter:

```sh
python3 tools/pipeline/run_book.py exodo
python3 tools/pipeline/run_book.py exodo --from-chapter 1 --to-chapter 5
```

`run_book.py` also does not call a model. Re-run it after the replies
for that pass exist.

## Answer the queue

The chapter queue is `pipeline/{ot|nt}/{book}/{book}-{chapter}.queue.json`.
Read `waiting`. Each item has `verse`, `stage`, `model`, `request`, and
`reply`.

| `model` | Who answers |
| --- | --- |
| `cursor-auto` | Cursor Auto |
| `sonnet` | Sonnet |

Open the request JSON. Follow `system` and `user`. Write only the JSON
object to the reply path. Do not write `translation/` or `STATUS.md`.

Requests and replies use these names:

| Stage | Request | Reply | Saved result |
| --- | --- | --- | --- |
| packet | | | `{book}-{chapter}-{verse}.packet.json` |
| draft | `…draft-auto.request.json` | `…draft-auto.reply.json` | `…draft-auto.json` |
| lint | | | `…lint.json` |
| audit | `…audit-auto.request.json` | `…audit-auto.reply.json` | `…audit-auto.json` |
| Sonnet | `…polish-sonnet5.request.json` | `…polish-sonnet5.reply.json` | `…polish-sonnet5.json` |
| re-audit | `…audit-pulir.request.json` | `…audit-pulir.reply.json` | `…audit-pulir.json` |

The verse moves like this:

1. Draft request. Auto replies. Re-run.
2. Lint. A lint failure skips the audit and asks Sonnet next.
3. Otherwise an audit request. Auto replies. Re-run.
4. Clean pass: the queue marks the verse `passed`.
5. Questionable: a Sonnet request. Sonnet replies. Re-run.
6. Re-audit request. Auto replies. Re-run.
7. Clean: `passed`. Still questionable: `hold`.

Repeat until `waiting` is empty. `--no-resume` redoes verses that
already passed or are parked. Leave it off for a normal run.

`--full` asks Sonnet for every verse, including clean passes. Do not
use it for a normal chapter.

## Put passed Spanish in the book file

```sh
python3 tools/pipeline/finish_book_apply.py exodo
```

This copies `passed` verses into `translation/ot/exodo.md` or
`translation/nt/{book}.md`. Sonnet’s text is used when Sonnet ran;
otherwise the Auto draft. Holds are written to
`pipeline/{ot|nt}/{book}/_logs/parked-holds.json`. The script does not
sign `STATUS.md`.

Book file shape:

```markdown
# Tito

## Capítulo 1

### 1:1

Pablo, siervo de Dios…
```

One verse, one `### chapter:verse` heading. One file per book.

## Spanish already in translation/

Do not redraft it with the chapter loop. Audit it:

```sh
python3 tools/pipeline/audit_translation.py genesis 1
python3 tools/pipeline/audit_translation.py genesis 1 --mode ingest
```

The first command writes Cursor Auto requests. The second reads
`*.audit-lbf.reply.json`. It does not rewrite the verse. Paid xAI is
`audit_translation.py … --xai` and is not the procedure.

## Paid path

Only when you mean to spend the API:

```sh
python3 tools/pipeline/run_chapter.py exodo 1 --api
```

That path is GPT, then local lint, then Grok. Sonnet runs only when
Grok warns. `draft_gpt.py`, `audit_grok.py`, and `polish_sonnet.py`
belong to that path. They are not the next step after a Cursor Auto
request.

## Checks

```sh
python3 tools/pipeline/test_cursor_auto.py
python3 tools/pipeline/test_source_packet.py
```
