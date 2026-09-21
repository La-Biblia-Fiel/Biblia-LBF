# 2 Reyes 7–12 — second-pass rewrite notes

**Verse count:** 164 (7:20 + 8:29 + 9:37 + 10:36 + 11:21 + 12:21). Matches packet files.

**Output:** `pipeline/ot/2reyes/_rewrite/ch07.md` … `ch12.md` only. No `translation/*.md`, no `STATUS.md`.

## Method

Hand calque from each `2reyes-{c}-{v}.packet.json` (OSHB surface + morph). Jehová / Mizraim / *ustedes*. Not gloss DP, not machine zip, not Ollama polish. Voice aligned with `pipeline/ot/1reyes/_rewrite/` (Elisha / Eliyahu / Shomrón / Yehú spine).

## Name forms used

| Form | Not |
| --- | --- |
| Elisha, Eliyahu el tishbí, Guejazí | Eliseo / Elías / Giezi |
| Yehú, Nimshí, Bidqar, Yehonadav hijo de Rejav, Yehoajaz | Jehú / Bidcar / Recab |
| Yoram / Yehoram; Ajazyahu / Ajazyá; Yehoash / Yoash | Joram / Ocozías / Joás |
| Atalyá / Atalyahu; Yehosheva; Yehoadá; Tseviyá | Atalía / Josaba / Joiada |
| Ajab, Izevel, Navot el yizreelí, Omrí, Yarovam, Nevat, Baashá, Ajiyá, Zimrí | — |
| Jazael (חזאל) / Jazeel (חזהאל); Ben-Hadad; Aram / aramím | Hazael unified |
| Shomrón, Yerushaláyim, Yizreel, Ramot Gilad, Dameseq, Yardén, Mizraim | Samaria / Jerusalén / Egipto |
| Bet Eqed, Bet ha-Gán, Bet El, Dan, Gilad, Bashán, Aroer, Arnón, Gat, Meguidó, Yivleam, Gur, Tseirá, Livná, Ramá, Milo, Sela, Beer Sheva | — |
| Yehudá, Israel, David, Yehoshafat, Amatsyá, Mattán, Shimát, Shomer, Yozavad, Yehozavad | — |
| pelishtim, jititas, gadí / reuvéní / menashí, karí | filisteos / hititas |
| Jehová, Dios, Adonai (7:6 H136); Baal | SEÑOR / Elohím |
| seá / dos seás, sólet, siclo, shalish / shalishím, arubot, nir, bamot, gevirá, nézer, edut, hatsotsrot, shofar, olá / olot, asham, jatatot, arón, torá, misaj | — |

Proposed locks not yet in `PROPER_NAMES.md` seed: Elisha, Guejazí, Yehú, Yoram/Yehoram, Ajazyahu, Yehoash, Atalyá, Yehoadá, Jazael/Jazeel, Shomrón, Yizreel, Bet Eqed, karí, etc. Orthography follows 1 Reyes rewrite spine where attested.

## Open / tight spots

- **7:2 / 7:19:** ארבות → *arubot* (not filled “ventanas”); היהיה → interrogative *¿será…?*
- **7:6:** אדני (H136) → *Adonai* (packet morph Sp1cs; treated as locked divine title).
- **7:7:** המחנה כאשר היא left *el campamento como ella*.
- **7:13:** Duplicated residual phrases left tight to packet (*he aquí ellos como todo Israel…*).
- **8:8–15:** Surface חזהאל / חזאל kept as *Jazeel* / *Jazael*.
- **8:10:** חיה תחיה / מות ימות → *Viviendo vivirás* / *muriendo morirá* (infinitive absolute).
- **8:16:** Parenthetical ויהושפט מלך יהודה kept inline.
- **9:8:** משתין בקיר → *meante en pared* (calque, not euphemism).
- **9:25–26:** נאם יהוה → *declaración de Jehová* (not “dice”).
- **10:27:** Packet ends וישמהו עד היום — *lo pusieron hasta el día* (no *letrinas*; that noun not in packet).
- **10:30:** בני רבעים → *hijos de cuartos* (four generations).
- **11:4 / 11:9–10:** Packet lacks המאות at 11:4/9/10; *jefes del karí* / *los jefes* (11:19 keeps *jefes de las cientas*).
- **11:6:** מסח left *misaj*.
- **11:20:** Packet ends בית without המלך — *casa* left open.
- **12:17:** יעלה yiqtol kept *subirá* before wayyiqtol narrative.
- **12:1 / 12:19–21:** יהואש / יואש surface kept *Yehoash* / *Yoash*.

## Not done here

No merge into `translation/ot/2reyes.md`. No STATUS bump. No alignment. Token extracts `_compact_ch07.txt` … `_compact_ch12.txt` are work aids only.
