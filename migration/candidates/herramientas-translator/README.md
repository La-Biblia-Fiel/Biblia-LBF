# Translator candidate corpus — NONCANONICAL, TEMPORARY

These files came from `cgv-translator/translations/` when the Translator
application was migrated into `Biblia-LBF/apps/translator/`.

**They are not canonical. They are not authoritative. Nothing here has been
approved.** They are kept only so the migration can be reconciled book by book
against the canonical project data.

Canonical LBF translation lives in `translation/`. Published text lives under
`releases/`.

## What is here, and why

Only the books whose candidate text differs from the canonical tree, plus the
books that exist only in the candidate tree:

| Book | Condition |
| --- | --- |
| `apocalipsis` | Candidate carries later revision work ("revisados contra la columna TR") absent from the canonical tree |
| `daniel` | 324 differing regions; candidate is a flat single-line file with no verse markers |
| `zacarias` | 5 differing regions; candidate is flat; canonical tree carries release provenance |
| `tito` | Exists only in the candidate tree |
| `titus-1-1` | Exists only in the candidate tree; likely an experiment or special-purpose file |

The other 26 books were byte-identical to the canonical tree and are **not**
copied here. They were duplicates, not migration candidates.

## Rules for this directory

- Do not edit these files.
- Do not treat them as a source of truth.
- Do not import from them wholesale. Reconcile per verse, per book.
- Delete this directory once reconciliation is complete and recorded.

Reconciliation evidence: `migration/reconciliation/`.
