# Translation source pipeline

Machine drafts stay `draft`. This pipeline does not write `STATUS.md`
or `translation/*.md`.

Allowed sources: **TR1894** (NT) or **OSHB/WLC + Paleo/AHRC** (OT).

```sh
python3 tools/pipeline/build_source_packet.py exodo 1 16
python3 tools/pipeline/draft_gpt.py exodo 1 16
python3 tools/pipeline/audit_grok.py exodo 1 16 \
  --candidate-file pipeline/ot/exodo/exodo-1-16.draft-gpt56.json --label gpt56
python3 tools/pipeline/polish_sonnet.py exodo 1 16
python3 tools/pipeline/run_chapter.py exodo 1
python3 tools/pipeline/audit_translation.py genesis 1              # Cursor Auto requests (default)
python3 tools/pipeline/audit_translation.py genesis 1 --mode ingest
python3 tools/pipeline/audit_translation.py genesis 1 --mode xai   # paid xAI only if needed
python3 tools/pipeline/test_source_packet.py
python3 apps/pipeline/server.py   # http://127.0.0.1:1432/
```

GPT drafts (Traduce / `lbf-drafter`). Source-fidelity audits may be Cursor Auto
(default for `audit_translation.py`) or xAI Grok (`--mode xai`). Chapter runs
skip Sonnet unless Grok warns (`--full` always polishes). Local lint parks known
anti-examples before audit. Verse buttons still run all four stations.
Sonnet (Pulir / `lbf-polisher`, HARD model Claude Sonnet 5) never moves meaning.

`audit_translation.py` audits Spanish already in `translation/*.md` (label `lbf`).
Default `--mode cursor`: builds packets + `*.audit-lbf.request.json` and a
chapter `*.queue.json` for Cursor agent **Audita** / Auto. Save each reply as
`*.audit-lbf.reply.json`, then `--mode ingest`. Resume skips matching audits.
`--lint` is opt-in (Genesis narrative uses *parió*; midwife lint is for
Exodus-style drafts).

Cost: prompts send compact JSON and omit non-binding AHRC. GPT default
`LBF_GPT_REASONING=low` (was API default medium). Keep `LBF_GPT_MODEL=gpt-5.6`.
For a further cut after a chapter still holds, try `gpt-5.6-terra`.

Spanish: current Latin American (`tú` / *ustedes*). Not Spain *vosotros*.

`run_chapter.py` auto-advances verses that Grok passes (no warns) and parks
lint/Grok fails for the app. It does not write `translation/*.md` or
`STATUS.md`. Resume skips passed verses and parked holds until you repair them.

Without `OPENAI_API_KEY` / `XAI_API_KEY`, omit `--ingest`. The tools write
request JSON under `pipeline/` and reuse a matching Cursor result already
on disk. `--ingest` is only for a JSON file you actually saved.
