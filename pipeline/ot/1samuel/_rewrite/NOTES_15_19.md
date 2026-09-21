# 1 Samuel 15–19 — second-pass rewrite notes

**Verse count:** 170 (15:35 + 16:23 + 17:58 + 18:30 + 19:24). Matches packet files.

**Output:** `pipeline/ot/1samuel/_rewrite/ch15.md` … `ch19.md` only. No `translation/*.md`, no `STATUS.md`.

## Method

Hand calque from each `1samuel-{c}-{v}.packet.json` (OSHB surface + morph), with qere restored where the packet builder dropped ketiv/qere pairs (checked against `source/hebrew/OSHB/morphhb/wlc/1Sam.xml`). Jehová / Mizraim / *ustedes*. Not Ollama polish, not gloss DP, not machine zip.

## Name forms used

| Form | Not |
| --- | --- |
| Shemuel, Shaúl, David, Yishai | Samuel, Saúl, Isaí |
| Yonatán | Jonatán / Jonathan |
| Golyat | Goliat |
| Mikal, Merav | Mical, Merab |
| Agag, Amaleq | Amalec |
| Avner, Avinadav, Eliav, Shamá | Abner, Abinadab, Eliab, Sama |
| Adriel el mejolatí | — |
| Bet Léjem, bet-lejemí | Belén |
| ha-Ramá / ha-Ramata, Guivat Shaúl | Ramá castiza |
| ha-Gilgal, ha-Carmelá, ha-Telaim | — |
| Javilá, Shur, Mizraim | Havila, Egipto |
| Sokó, Azeqá, Éfes Damim, ha-Elá | Soco, Azeca |
| Gat, Eqrón, Shaaráyim, Yerushaláim | — |
| Nayot, ha-Sejú | Naiot / Sechu |
| pelishtim / el pelishtí | filisteos |
| qení / amalequí | — |
| Yehudá, Israel | — |

Proposed locks not yet in `PROPER_NAMES.md` seed table: Shemuel, Shaúl, Yonatán, Golyat, Mikal, Merav, Agag, Avner, Avinadav, Eliav, Shamá, Adriel, Guivat Shaúl, ha-Telaim, ha-Carmelá, Éfes Damim, ha-Elá, Sokó, Azeqá, Nayot, ha-Sejú, Shaaráyim, Eqrón, Gat (place).

## Open / tight spots

- **15:9:** הַמִּשְׁנִים / הַכָּרִים → *los segundos* / *los carneros*; נְמִבְזָה וְנָמֵס → *despreciada y derretida* (kept open).
- **15:12:** מַצִּיב לוֹ יָד → *erigiendo a sí mano* (monument/hand; no interpretive “trofeo”).
- **15:29:** נֵצַח יִשְׂרָאֵל → *Gloria de Israel* (title left calqued, not “Eterno”).
- **15:32:** מַעֲדַנֹּת → *delicadezas*; Agag’s line left open.
- **16:16–23:** כִּנּוֹר → *kinor* (instrument name kept Hebraic).
- **17:4:** אִישׁ־הַבֵּנַיִם → *hombre de los entremedios*.
- **17:18:** חֲרִצֵי הֶחָלָב → *cortes del queso*; עֲרֻבָּתָם → *su prenda*.
- **17:52:** גַיְא (packet) → *gai* (valley); not filled as a named place beyond the surface.
- **18:1 / 18:7 / 18:9 / 19:18:** Packet omitted ketiv/qere tokens; qere restored from WLC (`ויאהבהו`, `באלפיו`, `עוין`, `בנָיוֹת`).
- **19:13, 19:16:** כְּבִיר הָעִזִּים → *red de las cabras* (pillow/net of goat-hair left as *red*).
- **19:18:** WLC verse ends at *Nayot* (no *ba-Ramá* in this OSHB cut).

## Not done here

No merge into `translation/ot/1samuel.md`. No STATUS bump. No alignment.
