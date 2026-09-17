# STATUS

Four states: `none` | `draft` | `ready` | `done`.
How to work: `WORKFLOW.md`. How the data may live: `DATA_CONTRACT.md`.

`ready` is written only by `python3 tools/verify.py`. That means the checks
passed. You still approve.

`done` requires a named human on this file **and** a passing `python3 tools/status.py`.

Signed columns stay empty until a human writes a name and an ISO date.

| book | testament | translation | alignment | translation_by | translation_on | alignment_by | alignment_on | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| genesis | ot | done | done | John Wry | 2026-08-28 | John Wry | 2026-08-28 |  |
| exodo | ot | ready | none |  |  |  |  |  |
| levitico | ot | ready | none |  |  |  |  |  |
| numeros | ot | ready | none |  |  |  |  |  |
| deuteronomio | ot | ready | none |  |  |  |  |  |
| josue | ot | ready | none |  |  |  |  |  |
| jueces | ot | ready | none |  |  |  |  |  |
| rut | ot | ready | none |  |  |  |  |  |
| 1samuel | ot | ready | none |  |  |  |  |  |
| 2samuel | ot | ready | none |  |  |  |  |  |
| 1reyes | ot | ready | none |  |  |  |  |  |
| 2reyes | ot | ready | none |  |  |  |  |  |
| 1cronicas | ot | ready | none |  |  |  |  |  |
| 2cronicas | ot | ready | none |  |  |  |  |  |
| esdras | ot | ready | none |  |  |  |  |  |
| nehemias | ot | ready | none |  |  |  |  |  |
| ester | ot | ready | none |  |  |  |  |  |
| job | ot | ready | none |  |  |  |  |  |
| salmos | ot | ready | none |  |  |  |  |  |
| proverbios | ot | ready | none |  |  |  |  |  |
| eclesiastes | ot | ready | none |  |  |  |  |  |
| cantares | ot | ready | none |  |  |  |  |  |
| isaias | ot | ready | none |  |  |  |  |  |
| jeremias | ot | ready | none |  |  |  |  |  |
| lamentaciones | ot | ready | none |  |  |  |  |  |
| ezequiel | ot | ready | none |  |  |  |  |  |
| daniel | ot | ready | draft |  |  |  |  | file exists; gloss maps are not alignment |
| oseas | ot | ready | none |  |  |  |  |  |
| joel | ot | ready | none |  |  |  |  |  |
| amos | ot | ready | none |  |  |  |  |  |
| abdias | ot | ready | none |  |  |  |  |  |
| jonas | ot | ready | none |  |  |  |  |  |
| miqueas | ot | ready | none |  |  |  |  |  |
| nahum | ot | ready | none |  |  |  |  |  |
| habacuc | ot | ready | none |  |  |  |  |  |
| sofonias | ot | ready | none |  |  |  |  |  |
| hageo | ot | ready | none |  |  |  |  |  |
| zacarias | ot | done | done | John Wry | 2026-08-18 | John Wry | 2026-09-16 | 211 `mapped`; AI audit pass (93/118/0; 9:17 H1715 false-fail overruled) |
| malaquias | ot | ready | none |  |  |  |  |  |
| mateo | nt | ready | none |  |  |  |  |  |
| marcos | nt | ready | none |  |  |  |  |  |
| lucas | nt | ready | none |  |  |  |  |  |
| juan | nt | ready | none |  |  |  |  |  |
| hechos | nt | ready | none |  |  |  |  |  |
| romanos | nt | ready | none |  |  |  |  |  |
| 1corintios | nt | ready | none |  |  |  |  |  |
| 2corintios | nt | ready | none |  |  |  |  |  |
| galatas | nt | ready | none |  |  |  |  |  |
| efesios | nt | ready | none |  |  |  |  |  |
| filipenses | nt | done | done | John Wry | 2026-08-18 | John Wry | 2026-08-19 | español rehecho contra el TR 2026-08-18; alineación caminada capítulo por capítulo, los 4 `walk-ch*.txt` firmados 2026-08-19 |
| colosenses | nt | ready | none |  |  |  |  |  |
| 1tesalonicenses | nt | ready | none |  |  |  |  |  |
| 2tesalonicenses | nt | ready | none |  |  |  |  |  |
| 1timoteo | nt | ready | none |  |  |  |  |  |
| 2timoteo | nt | ready | none |  |  |  |  |  |
| titus | nt | done | draft | John Wry | 2026-08-20 |  |  | mixed hand + auto-zip; auto is not finished |
| filemon | nt | ready | none |  |  |  |  |  |
| hebreos | nt | ready | none |  |  |  |  |  |
| santiago | nt | ready | none |  |  |  |  |  |
| 1pedro | nt | ready | none |  |  |  |  |  |
| 2pedro | nt | ready | none |  |  |  |  |  |
| 1juan | nt | ready | draft |  |  |  |  | reverse-links claim all-hand; unsigned |
| 2juan | nt | ready | none |  |  |  |  |  |
| 3juan | nt | ready | none |  |  |  |  |  |
| judas | nt | ready | ready |  |  |  |  | reverse-links claim all-hand; unsigned |
| apocalipsis | nt | done | done | John Wry | 2026-08-21 | John Wry | 2026-08-21 | later TR revision applied 2026-08-18; alignment not rechecked |

## Open human decisions

Nehemiah 7:68: OSHB/WLC has no source for this Protestant label (WLC Neh 7:68 is Protestant 7:69). First-pass may draft it only from Ezra 2:66 OSHB after explicit confirmation. Still draft until second-pass review. Apocalipsis Spanish: later TR revision accepted. Zacarías 11:2: `el cedro` already applied.

Zacarías (2026-09-16): translation + alignment both `done` (John Wry). Alignment path: structural map accept → AI audit pass → human approval.
