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

After Sonnet, Auto audits that Spanish once. A remaining lint hit, or a
re-audit verdict of `fail`, parks the verse and leaves the previous
Spanish. A `pass` is written into the verse. Warns on that pass stay in
the audit file for the human read. Sonnet does not run again.

A word the Hebrew does not have, added so the Spanish can be a sentence,
is italic: *son*. A marked copula does not park the verse. When a warn
is only number — a singular head noun against a plural participle —
Sonnet chooses the grammatical Spanish and writes the choice in
`readerNote` on the chapter report. A clause-role problem — who acts, or
which noun a preposition governs — stays on hold. Sonnet does not repair
it. That verse is for the translator, one verse at a time.

## Run a chapter

```sh
python3 tools/pipeline/auto_pass.py exodo 1
python3 tools/pipeline/auto_pass.py exodo 1 --from 1 --to 5
```

This command calls the Cursor CLI (`agent`) for Cursor Auto and, when
the verse is questionable, for Sonnet. It walks the chapter and writes
a passing repair into `translation/`. When it finishes, a person reads
the chapter and the report and approves. It does not sign `STATUS.md`.

`agent` has to be on `PATH` and logged in:

```sh
curl https://cursor.com/install -fsS | bash
agent login
agent models
```

`LBF_CURSOR_AUTO_MODEL` defaults to `auto`. `LBF_CURSOR_SONNET_MODEL`
defaults to `claude-sonnet-5` (or `LBF_SONNET_MODEL` when that is set).
If the CLI rejects the id, set one from `agent models`.

Spanish already in the book file is audited. A clean pass stays. A fail
or a warn goes to Sonnet once. Auto audits that Spanish again. Verdict
`pass` replaces the verse. Verdict `fail`, or a lint hit that remains,
parks the verse and leaves the previous line.

The report is
`pipeline/{ot|nt}/{book}/_logs/{book}-{chapter}.auto-pass.json`.

A verse with no Spanish yet is drafted by Auto, then audited on the
same path. It enters the book file when the audit accepts it.

`--no-resume` calls the models again. `--full` sends every verse to
Sonnet, including a clean pass. Leave both off for a normal chapter.

The request queue is still there for answering inside the editor, one
JSON file at a time:

```sh
python3 tools/pipeline/run_chapter.py exodo 1
python3 tools/pipeline/run_book.py exodo
```

Those scripts write requests under `pipeline/`. They do not call the
CLI. Re-run them after each reply file exists. `finish_book_apply.py`
copies that queue's `passed` verses into the book file.
`auto_pass.py` is the command that finishes a chapter on its own.

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
7. Re-audit `pass`: `passed`, even when warns remain. Re-audit `fail`: `hold`.

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

```sh
python3 tools/pipeline/auto_pass.py exodo 1
```

That command audits the file, sends fails and warns to Sonnet once,
re-audits, and writes repairs whose verdict is `pass`.

`audit_translation.py` only writes audit requests for a manual editor
reply. It does not repair. Paid xAI is `audit_translation.py … --xai`
and is not the procedure.

## Previous script

The paid GPT → Grok runner is a different file:

```sh
python3 tools/pipeline/run_chapter-old.py exodo 1
```

That is GPT, then local lint, then Grok. Sonnet runs only when Grok
warns. Its JSON has `passed`, `holds`, and `errors`, and no `engine`
field. `draft_gpt.py`, `audit_grok.py`, and `polish_sonnet.py` belong
to that path. They are not the next step after a Cursor Auto request.

## Checks

```sh
python3 tools/pipeline/test_auto_pass.py
python3 tools/pipeline/test_cursor_auto.py
python3 tools/pipeline/test_source_packet.py
```
