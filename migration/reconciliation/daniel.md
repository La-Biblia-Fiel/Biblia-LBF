<!-- NONCANONICAL. Reconciliation evidence only. Resolved 2026-08-18T12:40:35.653578Z -->

# Reconciliation — daniel — RESOLVED

**Decision: candidate discarded. No canonical text changed.**

The candidate was not translation work. Measured against both lineages:

| Comparison | Differing regions |
| --- | --- |
| candidate vs the **release** | 2 |
| candidate vs **canonical** | 324 |
| canonical vs the release | 322 |

So the candidate is a copy of the published release. Worse, it is a damaged one:
the file opens `"Pablo, siervo de Dios,"` — the first words of Titus — and then
continues from Daniel 1:2. **Daniel 1:1 is missing entirely.** Both "differing
regions" against the release are that corruption.

Moved to `migration/_to_delete/apps-translator-translations/daniel.md`.

## Separate finding — the Daniel release is stale

`translation/ot/daniel.md` differs from the release it names,
`releases/daniel/1.0.0/LBF-daniel-1.0.0-1533cdd52bdb`, in **177 of 357 verses**.
The canonical file is the *later* work: at 1:4 the release reads "e entendidos"
and canonical corrects it to "y entendidos"; 1:5 and 1:7 are rephrased.

This is the opposite of Zacarías, where canonical had drifted *behind* its
release. Here canonical is ahead and the release needs re-cutting.

**Knock-on:** `cgv-reader/data/lbf/ot/daniel.alignment.json` was re-derived from
that release, so the Reader currently shows release-era Spanish for Daniel while
the canonical text has moved on. Not wrong — the Reader is meant to consume
published data — but the two will only agree again after a re-release.

Unresolved, for you: whether to re-release Daniel 1.0.1 from current canonical.
