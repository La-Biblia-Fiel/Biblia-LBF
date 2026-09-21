# 1 Samuel 20–25 — second-pass rewrite notes

**Verse count:** 175 (20:42 + 21:15 + 22:23 + 23:29 + 24:22 + 25:44). Matches Protestant packet files.

**Output:** `pipeline/ot/1samuel/_rewrite/ch20.md` … `ch25.md` only. No `translation/*.md`, no `STATUS.md`.

## Method

Hand calque from each `1samuel-{c}-{v}.packet.json` (OSHB surface + morph). Jehová / *ustedes*. Not Ollama polish, not gloss DP, not machine zip.

## Name forms used

| Form | Not |
| --- | --- |
| David, Yehonatán, Shaúl, Shemuel | Jonatán, Saúl, Samuel |
| Yishái, Avner, Ajimélek, Ajituv, Evyatar | Isaí, Abner, Ajimelec |
| Nov, Ramá, ha-Givá, Bet Léjem | Nob, Guibeá |
| Doeg el edomí, Golyat el pelishtí | Doeg / Goliat / filisteo gloss |
| Ajish, Gat, Adulam, Mitspé Moav | Aquis |
| Gad, Járet, Keilá, Zif, zifim | — |
| ha-Joreshá / Joreshá, ha-Jakilá, yeshimón | Horesa |
| Maón, Ein Guedí, Sela ha-Majlekot | En-gedi |
| Naval, Avigáyil, kalibí, Karmel / ha-Karmel | Nabal, Abigail, Carmelo |
| Parán, Ajinoam, Yizreel, Mikal, Palti, Layish, Galim | Mical, Palestí |
| beliaal | “inicuo” interpretive gloss |
| naguid | “príncipe” interpretive gloss |
| pelishtim | filisteos (ethnonym as name) |

Proposed locks not yet in `PROPER_NAMES.md` seed: Yehonatán, Shaúl, Shemuel, Yishái, Avner, Ajimélek, Ajituv, Evyatar, Nov, Doeg, Golyat, Ajish, Adulam, Járet, Keilá, Zif, Joreshá, Jakilá, Maón, Ein Guedí, Sela ha-Majlekot, Naval, Avigáyil, kalibí, Karmel, Parán, Ajinoam, Yizreel, Mikal, Palti, Layish, Galim, ha-Elá, ha-Azél.

## Packet / WLC gaps (ketiv–qere often dropped)

Restored from WLC consonants where the packet omitted the pair or the Protestant fold:

- **20:38:** `החצים` (qere) after `את` — *las flechas*.
- **20:42:** WLC `21:1` folded into Protestant close — *Y se levantó y anduvo; y Yehonatán vino a la ciudad* (packet `20:42` ends at `עולם`; `21:1` packet = OSHB `21.2`).
- **21:11:** song completion `באלפיו` / `ברבבתיו` — *en sus miles… en sus miríadas*.
- **22:17:** `אזני` after bare `את` — *mi oreja*.
- **24:4:** `איביך` after bare `את` — *tu enemigo*.
- **25:3:** `כלבי` after `והוא` — *kalibí*.
- **25:18:** subject `Avigáyil` + `עשויות` — *hechas*.

## Open / tight spots

- **20:4 / 20:8–9:** 2fs clitics on David kept as Spanish *ti* (addressee); morph gender left unexpanded.
- **20:26:** *accidente… no limpio* left open (מקרה / טהור).
- **21:5:** *camino común / santificado en el utensilio* kept calque-tight.
- **23:7:** נכר → *enajenó* (not “delivered” gloss).
- **24:3:** להסיך את־רגליו → *para cubrir sus pies*.
- **25:22 / 25:34:** משתין בקיר left as *orinador en pared* (idiom not softened).
- **25:31:** לפוקה → *tropiezo* (AHRC empty; parallel to מכשול).

## Not done here

No merge into `translation/ot/1samuel.md`. No STATUS bump. No alignment.
