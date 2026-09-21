# 2 Reyes 1–6 — second-pass rewrite notes

**Verse count:** 174 (1:18 + 2:25 + 3:27 + 4:44 + 5:27 + 6:33). Matches Protestant packet files (`2reyes-{c}-{v}.packet.json`).

**Output:** `pipeline/ot/2reyes/_rewrite/ch01.md` … `ch06.md` only. No `translation/*.md`, no `STATUS.md`.

## Method

Hand calque from each OSHB packet (surface + morph). Jehová / Mizraim / *ustedes*. Not gloss DP, not machine zip, not Ollama polish. Voice aligned with `pipeline/ot/1reyes/_rewrite/` (esp. ch. 17–22: Eliyahu / Elisha / Ajab / Shomrón).

## Name forms used

| Form | Not |
| --- | --- |
| Eliyahu / Eliyá (אליהו / אליה); tishbí | Elías |
| Elisha; Shafat | Eliseo |
| Ajazyá / Ajazyahu; Ajab; Yehoram | Acazías / Acab / Joram |
| Yehoshafat; Yehudá; Yerushaláyim | Josafat / Judá / Jerusalén |
| Shomrón; Moav; Edom; Aram; Dameseq | Samaria / Moab / Siria / Damasco |
| Baal Zebuv; Eqrón; Baal; Rimón | Baal-zebub / Ecrón |
| Gilgal; Bet El; Yerijó; Yardén; Karmel | Jericó / Jordán / Carmelo |
| Yarovam hijo de Nevat; Mesha; noqed | Jeroboam / Mesa |
| Qir Jaraset; midbar; matsevá; olá | Kir-hareshet |
| Guejazí; Shunem; shunamit; asuj | Giezi / Sunem |
| Naamán; aramí; Parpar; Efráyim; ofel | Naamán / Parafar |
| Dotán; Ben Hadad; sanverim; qav; tsemed | Dotán / Ben-adad |
| Jehová; Dios (אלהים); Adonai only if אדני address | Elohím / SEÑOR |

Proposed locks not yet in `PROPER_NAMES.md` seed: Eliyahu/Eliyá, Elisha, Ajazyahu, Yehoram, Guejazí, Naamán, Baal Zebuv, Eqrón, Qir Jaraset, Dotán, Rimón, Shunem. Orthography follows 1 Reyes rewrite spine where attested.

## Open / tight spots (packet lacunae kept)

- **2:16:** Packet ends `באחת` without `הגאיות`; left *en una de las—*.
- **3:24:** Surface `בה והכות`; calqued *en ella, y hiriendo*.
- **4:5:** Packet ends `והיא` (no `מצקת`); left *y ella—*.
- **4:7:** Packet `ושלמי את ואת` lacks `נשיך בניך`; left *paga el—, y tú vivirás*.
- **4:34:** Packet `וכפיו על` lacks second `כפיו`; left *sus palmas sobre—*.
- **5:12:** Packet lacks `אמנה` between `טוב` and `ופרפר`; left *¿No buenos— y Parpar…?*.
- **5:25:** Packet has `אלישע גחזי` without `מאין`; vocative only (*Guejazí*).
- **6:25:** Packet has `רבע הקב` without `חרי יונים`; calqued *cuarto del qav* only.

Other notes: **1:8** `איש בעל שער` → *hombre señor de pelo*; **2:9** *boca de dos* (פי שנים); **4:30** `אם הנער` = *madre del joven* (not “si”); **4:39** `ארת` → *ortigas*; **4:42** `כרמל` left *carmel*; **5:17** `צמד` → *tsemed*; **6:18** `סנורים` → *sanverim*.

## Not done here

No merge into `translation/ot/2reyes.md`. No STATUS bump. No alignment. `_compact_ch01.txt`…`_compact_ch06.txt` are work aids only.
