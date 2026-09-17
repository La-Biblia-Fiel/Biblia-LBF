# LBF translation pipeline app

Local UI for one verse, or a chapter pass-through.

**Chapter (default):** GPT draft → local lint → Grok. Sonnet only if Grok warns.

**Verse buttons:** GPT → Grok → Sonnet → Grok.

Lint/Grok fails park under Holds. Does not write `translation/*.md` or
`STATUS.md`.

```sh
python3 apps/pipeline/server.py
```

Open <http://127.0.0.1:1432/>.

Needs API keys. A process already running will not see keys you export later.

Copy `apps/pipeline/.env.example` to `apps/pipeline/.env` (gitignored) and fill it:

| Step | Key |
| --- | --- |
| GPT | `OPENAI_API_KEY` |
| Grok | `XAI_API_KEY` or `GROK_API_KEY` |
| Sonnet | `ANTHROPIC_API_KEY` |

Verse buttons: Sonnet will not run until Grok has **passed** the GPT draft.
Grok will not accept a polish until Sonnet has written one.

**Run chapter** walks every Protestant verse in the open chapter. Economy
mode skips Sonnet when Grok passes with no warns. Lint hits (vosotros,
parir, que viva, el sexo, parto) park with no Grok call. Click a hold to
repair that verse. Use `run_chapter.py --full` for four stations every verse.

Cost: live prompts omit AHRC and send compact JSON. `LBF_GPT_REASONING=low`
(in `.env`) keeps GPT-5.6 Sol. After a restart, optional `gpt-5.6-terra`
is a cheaper 5.6 tier — do not change it mid-chapter.
