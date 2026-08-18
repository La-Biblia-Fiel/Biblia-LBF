# Reconciliation reports — READ ONLY

Generated evidence for the Translator migration. **No translation file was
modified to produce these, and no recommendation here has been applied.**

| Report | Regions | Condition | Required decision |
| --- | --- | --- | --- |
| `apocalipsis.md` | 899 | Candidate contains later TR revision work not in the canonical tree | Review verse by verse; decide which revisions are accepted |
| `daniel.md` | 324 | **RESOLVED** — candidate was a damaged copy of the release, missing Daniel 1:1 | discarded; Daniel release is stale and needs re-cutting |
| `zacarias.md` | 5 | **RESOLVED** — 211/211 text and alignment now agree | done |
| `tito.md` | 7 | **RESOLVED** — canonical is `translation/nt/titus.md`; TR readings accepted | done |
| `titus-1-1.md` | 3 | **RESOLVED** — complete duplicate of Titus | discarded |

Each report has empty `classification` and `decision` columns. Fill them in.
Suggested classifications: accepted revision, unapproved proposal, formatting
transformation, regression, unresolved.

## Zacarías — verified against its release

`translation/ot/zacarias.md` was compared to the release it names,
`releases/zechariah/1.0.0/LBF-zechariah-1.0.0-8cb0343354a5`:

- 211 of 211 verses present on both sides, none missing or extra;
- **210 verses match exactly**;
- **11:2 does not match.**

At 11:2 the published release reads "porque cayó **el** cedro" while the
canonical editable file reads "porque cayó cedro". The alignment units agree
with the canonical file; the translator candidate agrees with the release.

That means the published release was built from a text that differs from the
current canonical file by one word. This is unresolved and is a human decision.
It has not been changed.

## Correlation worth noting

Zacarías has 6 unlinked Hebrew tokens in its alignment. Three of them fall in
the three verses where the canonical and candidate texts diverge — 4:2, 11:2
and 14:6. The alignment appears to have been built against one of the two texts.
