# Matthew 1:18–25 Complexity Inspection

Status: investigation record, 2026-09-09. This is a TR1894-specific analysis plan, not a completed syntax dataset.

## Sources and boundary

The text authority is the local [TR1894 text](/Users/johnwry/Nextcloud/Documents/GitHub/Biblia-LBF/source/greek/TR1894/tr1894.txt), bound to SHA-256 `9d0dba729aaee22e0054482b0385b58a8365107a9f9621fd2c8535bfd1b8ebcc`. Morphology is checked against local `robinson-parsed/MT.UTR`. N1904 MACULA XML is an architecture/comparison source only.

This passage was chosen because it contains participial and infinitival structures, coordination, embedded and subordinate clauses, reported speech, a quotation, and a quotation explanation.

## TR-specific clause plan

The table lists manually reviewed proposed units. IDs are deliberately provisional until a complete source-token fixture has passed the reconciliation gate.

| TR reference | Proposed unit | Construction to preserve | Initial structural relation |
| --- | --- | --- | --- |
| 1:18a | “Τοῦ δὲ Ἰησοῦ Χριστοῦ γέννησις οὕτως ἦν” | Verbless/subject-predicate presentation with copula | Main clause |
| 1:18b | “μνηστευθείσης … Μαρίας τῷ Ἰωσήφ” | Genitive-absolute participial construction | Dependent circumstance |
| 1:18c | “πρὶν συνελθεῖν αὐτούς” | `πρίν` + infinitive | Temporal subordinate construction |
| 1:18d | “εὑρέθη … ἔχουσα ἐκ Πνεύματος Ἁγίου” | Finite passive with participial predicate/qualifier and PPs | Main clause with embedded predicate material |
| 1:19a | “Ἰωσὴφ … δίκαιος ὢν” | Attributive/copular participial material | Subject description |
| 1:19b | “καὶ μὴ θέλων αὐτὴν παραδειγματίσαι” | Negated participle governing infinitive | Coordinate dependent circumstance |
| 1:19c | “ἐβουλήθη λάθρᾳ ἀπολῦσαι αὐτήν” | Finite volitional verb governing infinitive | Main clause |
| 1:20a | “ταῦτα δὲ αὐτοῦ ἐνθυμηθέντος” | Genitive absolute | Dependent circumstance |
| 1:20b | “ἄγγελος Κυρίου … ἐφάνη αὐτῷ, λέγων” | Main finite clause with participial speech introducer | Main clause |
| 1:20c–1:21 | Angel’s direct speech | Vocative, prohibition + infinitive, explanatory `γάρ`, coordinated futures | Reported-speech subtree |
| 1:22 | “τοῦτο … γέγονεν, ἵνα …” | Main clause plus purpose/result `ἵνα` clause, participial attribution | Narrative-to-quotation bridge |
| 1:23 | Scripture quotation | Two coordinated finite clauses; explanatory relative/copular phrase | Quotation subtree |
| 1:24 | “διεγερθεὶς … ἐποίησεν ὡς …; καὶ παρέλαβε …” | Aorist participle, comparative/subordinate clause, coordination | Main narrative clause |
| 1:25 | “οὐκ ἐγίνωσκεν … ἕως οὗ ἔτεκε …; καὶ ἐκάλεσε …” | Negated imperfect, temporal clause, coordination | Main narrative clause |

The target tree should make every listed unit a TR-token span, preserve its parent/child relation, and keep reported speech and the Isaiah quotation as explicit structures rather than flattening them into verse rows.

## Textual and tokenization comparison with N1904 MACULA

N1904 supplies helpful tree shapes but cannot be transplanted because the terminal sequences differ.

| Location | Local TR1894 | N1904 MACULA | Impact |
| --- | --- | --- | --- |
| 1:18a | `γέννησις` | `ἡ γένεσις` | N1904 has an article and a different surface form; preserve TR tokenization. |
| 1:18b | `μνηστευθείσης γὰρ` | `μνηστευθείσης` | N1904 omits the TR `γάρ`; no one-to-one terminal transfer. |
| 1:18c | `πρὶν συνελθεῖν` | `πρὶν ἢ συνελθεῖν` | N1904 inserts `ἤ`; the subordinate-clause span differs. |
| 1:19 | `παραδειγματίσαι` | `δειγματίσαι` | Different verb surface/reading; syntax must bind TR token. |
| 1:20 address | `υἱὸς Δαβίδ`; `Μαριὰμ` | `υἱὸς Δαυείδ`; `Μαρίαν` | Textual and inflection/spelling differences require independent TR terminals. |
| 1:23 | `Ἰδού, παρθένος … ἐστι` | `Ἰδοὺ ἡ παρθένος … ὅ ἐστιν` | Added article and pronoun change the quotation subtree. |
| 1:24 | `διεγερθεὶς … Ἰωσὴφ … παρέλαβε` | `ἐγερθεὶς … ὁ Ἰωσὴφ … παρέλαβεν` | Different participle, article, and finite surface. |
| 1:25 | `τὸν υἱόν αὐτῆς τὸν πρωτότοκον` | `υἱόν` | N1904 lacks the TR expansion; its token/phrase span cannot be reused. |

These differences also demonstrate why the local text file, not N1904 or SBLGNT, must determine IDs and source reconstruction.

## What MACULA contributes safely

The N1904 nested nodes show a workable approach to the same *kinds* of structures:

* 1:18 is split into a copular clause and a following dependent construction.
* 1:19 nests participial and infinitival material under the finite decision clause.
* 1:20–21 forms a broad sentence tree with direct-speech material embedded below the appearance clause.
* 1:22–23 links the fulfillment clause, quotation, and explanation without losing nesting.

Those are structural analogies only. The TR prototype should independently decide each boundary and label after its local source tokens, morphology mapping, and evidence notes have been checked.

## Required next implementation step

Create a manual machine-readable fixture for this passage only after a reviewer approves the proposed units above. It should use the local TR token spine; attach UTR morphology through an explicit reconciliation record; and pass the same source reconstruction, terminal coverage, tree, and clause-index checks used by the Matthew 1:1 fixture. No whole-book conversion follows from this investigation.

