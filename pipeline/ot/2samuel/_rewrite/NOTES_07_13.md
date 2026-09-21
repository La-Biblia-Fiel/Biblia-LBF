# 2 Samuel 7–13 — second-pass rewrite notes

**Verse count:** 176 (7:29 + 8:18 + 9:13 + 10:19 + 11:27 + 12:31 + 13:39). Matches packet files.

**Output:** `pipeline/ot/2samuel/_rewrite/ch07.md` … `ch13.md` only. No `translation/*.md`, no `STATUS.md`.

## Method

Hand calque from each `2samuel-{c}-{v}.packet.json` (OSHB surface + morph). Jehová / Mizraim / *ustedes*. Not gloss DP, not machine zip, not Ollama polish. Voice aligned with `pipeline/ot/2samuel/_rewrite/ch01–06` and `1samuel/_rewrite/`.

## Name forms used

| Form | Not |
| --- | --- |
| David, Shaúl, Yehonatán, Natán, Shelomó, Yedidyá | Saúl, Jonatán, Natán→Nathan, Salomón |
| Yoav, Avishai, Tseruyá, Benayahu, Yehoyadá | Joab, Abisai, Zeruya |
| Uriyá el jití; Bat-Shéva; Eliam | Urías, Betsabé |
| Amnón, Tamar, Avshalom; Yonadav / Yehonadav; Shimá | Absalón, Jonadab |
| Mefibóshet, Tsivá, Majir, Amiël, Lo Devar, Mijá | Mefiboset, Ziba |
| Hadadézer, Rejov, Tsová, Toí, Jamat, Yoram | Hadad-ezer |
| Aram, Dameseq, Betaj, Berotai, Guei Mélaj, Edom | Damasco / Egipto |
| Amón / Janún / Najash; Rabá; Maajá; Ish-Tov; Bet Rejov | Jabés / Rabá→Rabbah |
| Jeilam / Jeilama; Shovaj; Yardén | — |
| Yerushaláyim; Yerijó; Tevéts; Yerubeshet; Baal-Jatsor; Efráyim | Jerusalén |
| Talmai, Geshur; Tsadoq, Ajituv, Ajimélek, Evyatar, Serayá | — |
| Yehoshafat, Ajilud; keretí, peletí; pelishtim; Moav; Amaleq | filisteos |
| naguíd; hesed; lebavot; pasim; Méteg ha-Amá | — |
| Adonai Jehová (H136+H3069); Dios (אלהים) | Elohím / SEÑOR |

Proposed locks not yet in `PROPER_NAMES.md` seed: Uriyá, Bat-Shéva, Hadadézer, Tsová, Toí, Jamat, Yoram, Mefibóshet, Tsivá, Lo Devar, Janún, Jeilam, Shovaj, Yerubeshet, Yedidyá, Shelomó, Baal-Jatsor, Méteg ha-Amá, lebavot, pasim. Orthography follows ch01–06 / 1 Samuel spine where attested (`Yerushaláyim`, `Mefibóshet`, `naguíd`, `pelishtim`).

## Open / tight spots

- **7:3 / 7:27:** 2fs clitics (`עמך`, `לך`) kept as Spanish *ti*; morph gender left unexpanded.
- **7:8:** נגיד → *naguíd* (title left Hebraic).
- **7:15:** ממנו tagged Sp1cp in packet; rendered *de él* (seed / Shaúl parallel); noted.
- **7:19:** תורת האדם → *torá del hombre* (left open; not “custom of man” gloss fill).
- **8:1:** מתג האמה → *Méteg ha-Amá* (place/compound left; not “bridle of the cubit” interpretation).
- **8:3:** Packet ends at בנהר without Perat; left *en el río*.
- **8:13:** גיא מלח → *Guei Mélaj*.
- **10:6:** איש טוב → *Ish-Tov*; בית רחוב → *Bet Rejov*.
- **10:16–17:** חילם / חלאמה → *Jeilam* / *Jeilama* (directive).
- **11:1:** המלאכים with lemma H4428 → *los reyes* (ketiv/qere kings).
- **11:21:** ירבשת → *Yerubeshet* (packet surface; not Yerubaal).
- **11:24:** Packet opens אל עבדיך without shooters clause; calqued as-is.
- **12:14:** נאץ … את איבי יהוה kept as *despreciaste a enemigos de Jehová* (packet object).
- **12:30:** מלכם → *su rey* (H4428; not Molek).
- **13:5–6:** לבבות / לבבות → *lebavot* (food cakes left Hebraic).
- **13:18:** כתנת פסים → *túnica de pasim*.
- **13:34:** Packet `את ויַּרא` lacks object after את; left *alzando el muchacho el atalaya a*.
- **13:39:** ותכל דוד … לצאת → *se consumió David el rey de salir* (packet 3fs on David).

## Not done here

No merge into `translation/ot/2samuel.md`. No STATUS bump. No alignment. Token extracts `_tokens_ch07.txt`…`_tokens_ch13.txt` are work aids only.
