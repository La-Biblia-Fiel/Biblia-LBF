<!-- NONCANONICAL, TEMPORARY. Reconciliation evidence only.
     Generated read-only; no translation file was modified.
     Generated 2026-08-18T07:47:15.996805Z -->

# Reconciliation — zacarias
- canonical: `translation/ot/zacarias.md` (211 verses)
- candidate: `apps/translator/translations/zacarias.md` (FLAT — single line, no verse markers)
- differing regions: **5**
- release provenance: `releases/zechariah/1.0.0/LBF-zechariah-1.0.0-8cb0343354a5/zechariah.lbf.md`

> Classification is a human decision. Nothing here has been applied.

| # | verse | op | canonical | candidate | classification | decision |
|---|---|---|---|---|---|---|
| 1 | 4:2 | replace | dijo: | dije: | regression | REJECTED — canonical "dijo" stands |
| 2 | 11:2 | insert |  | el | accepted revision | APPLIED — "el" added to translation/ot/zacarias.md |
| 3 | 14:6 | replace | será | acontecerá que | unapproved proposal | REJECTED — canonical stands |
| 4 | 14:6 | replace | aquel día: | ese día | unapproved proposal | REJECTED — canonical stands |
| 5 | 14:6 | replace | luz; preciosas se congelarán. | luz clara, ni oscura. | unapproved proposal | REJECTED — canonical "no habrá luz; preciosas se congelarán" stands |

## Resolution — 2026-08-18T08:05:55.013784Z

Human decisions recorded by the repository owner:

| Verse | Decision | Applied |
| --- | --- | --- |
| 4:2 | Canonical "dijo" stands; the candidate "dije" is a regression | no change |
| 11:2 | Accept "el" — the canonical file had drifted from its own release | **applied** |
| 14:6 | Canonical "no habrá luz; preciosas se congelarán" stands | no change |

`translation/ot/zacarias.md` now matches
`releases/zechariah/1.0.0/LBF-zechariah-1.0.0-8cb0343354a5` on **211 of 211
verses**. Before this edit it matched on 210.

### Alignment — RESOLVED 2026-08-18T08:08:52.813630Z

Unit `151:4` now reads `'el cedro, '` (chars 27–37) against `h38011002005`
(אֶרֶז, anarthrous). The supplied Spanish article rides with the noun it
modifies and carries no source token of its own; it is marked `"supplied": "el"`.
The 10 later units in 11:2 were shifted +3 characters. Offsets were re-checked:
every unit indexes its own surface, with no gaps or overlaps.

Result: **all 211 verses now reconstruct the LBF text** — previously 210.
The units agree with both `translation/ot/zacarias.md` and the published
release.

Backup of the pre-edit alignment:
`alignment/ot/zacarias/backups/zacarias-reverse-links.pre-11-2-supplied-article-*.json`

**Contract consequence, not yet actioned:** per `DATA_CONTRACT.md` an alignment
change invalidates alignment approval for the affected verse and increments the
alignment revision. The release manifest binds `ALN-zechariah-679cb51cd289`,
computed from the released alignment artifact. Any re-release must recompute
that id — the working alignment no longer matches the one the current release
was built from.

### Superseded — original open consequence

The 11:2 alignment does not yet cover the supplied article. Unit `151:4` reads
`'cedro, '` against Hebrew `h38011002005` (אֶרֶז, anarthrous). Until it reads
`'el cedro, '` the alignment does not reconstruct the verse.

Per `DATA_CONTRACT.md`, an alignment change increments the alignment revision
and invalidates alignment approval for the affected verse. Not applied.

### Closed non-issue

MT 11:2 w16 (הַבָּצִיר) is unlinked because w15/w16 are a ketiv/qere pair and
only one form is rendered in Spanish. Not a gap.
