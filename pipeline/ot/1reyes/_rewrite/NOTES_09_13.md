# 1 Reyes 9–13 — second-pass rewrite notes

**Verse count:** 167 (9:28 + 10:29 + 11:43 + 12:33 + 13:34). Matches packet files.

**Output:** `pipeline/ot/1reyes/_rewrite/ch09.md` … `ch13.md` only. No `translation/*.md`, no `STATUS.md`.

## Method

Hand calque from each `1reyes-{c}-{v}.packet.json` (OSHB surface + morph). Jehová / Mizraim / *ustedes*. Not gloss DP, not machine zip, not Ollama polish. Voice aligned with `pipeline/ot/1samuel/_rewrite/` and `pipeline/ot/2samuel/_rewrite/`.

## Name forms used

| Form | Not |
| --- | --- |
| Shelomó, David, Rejavam, Yarovam, Nevat | Salomón / Roboam / Jeroboam |
| Jiram, Tsor, Shevá, Ofir / Ofirá, Tarshísh | Hiram / Tiro / Sabá |
| Yerushaláyim, Givón, Gézer, Hatsor, Meguidó, ha-Miló, ha-Galil / Galil, Kabul | Jerusalén / Gabaón / Hazor |
| Bet Jorón, Baalat, Etsión Gáver, Elot, Levanón, Shefelá | Bet-horón |
| Mizraim, Faraón, Shishaq, Tajpenés, Genuvat | Egipto / Sisac |
| Hadad / Adad, Hadadézer, Rezón, Eliadá, Tsová, Aram, Dameseq | — |
| Midyán, Parán, Edom / edomí / edomím, Moav / moaviyot, Amón / amoním / amoniyot | — |
| Tsidón / tsidoním / tsidonín / tsidoniyot; jití / jititas / jitiyot | Sidón |
| kenaaní, jiví, perizí, amorí, yevusí | — |
| Ashtóret, Kemosh, Molek, Milkom | Astoret / Quemos / Moloc |
| Ajiyá ha-shiloní, Tseréda, Tseruá, Shejem, Penuel, Bet El, Dan, Shomerón | Ajías / Siquem / Samaria |
| Adoram, Shemayá, Yoshiyahu, Yishai, Yoav, Yosef, Leví, Efráyim / efratí, Binyamín, Yehudá | — |
| Israel (locked as in Samuel spine, not *Yisrael*) | — |
| olá / olot, shelamím, bamá / bamot, mas, kikar, maním, almugím, shenhavím, qofím, tukiyím, shikmím, pilegashím, sarot, akrabím, deshen, ela, nasí, nir, gevirá, sefer | — |

Proposed locks not yet in `PROPER_NAMES.md` seed: Shelomó, Rejavam, Yarovam, Jiram, Tsor, Shevá, Shishaq, Ajiyá, Shejem, Shomerón, Ashtóret, Kemosh, Milkom, Yoshiyahu, Etsión Gáver, Mikvé (10:28 place; packet H4723). Orthography follows 2 Samuel rewrite spine where attested (`Yerushaláyim`, `Jiram`, `Tsor`, `Gézer`, `ha-Miló`, `Dameseq`, `Hadadézer`).

## Open / tight spots

- **9:18:** Packet has `וְאֶת בַּעֲלָת וְאֶת בַּמִּדְבָּר בָּאָרֶץ` (no Tadmor). Left *y a Baalat y a — en el desierto en la tierra*.
- **9:23:** חֲמִשִּׁים וַחֲמֵשׁ מֵאוֹת → *cincuenta y cinco cientos* (550).
- **10:5:** Packet lacks משרתיו between ומעמד and ומלבשיהם; calqued *la estación y sus vestidos*.
- **10:28–29:** מקוה left *Mikvé* (place; not emended to Que/Kue).
- **11:7:** אז יבנה yiqtol → *edificará* (morph retained).
- **11:17–18:** Surface אדד then הדד; kept *Adad* then *Hadad* as packet.
- **11:33:** צִדֹנִין singular gentilic in packet → *tsidonín*.
- **12:2:** Packet ends וישב ירבעם במצרים (settled in Egypt), not “returned from.”
- **12:7:** Packet opens אֵלָיו לֵאמֹר (no וידברו); left *A él, diciendo*.
- **12:12:** Packet lacks ויבאו; left *Yarovam y todo el pueblo a Rejavam…*.
- **12:21:** Packet lacks ויבא; left *Rejavam Yerushaláyim; y reunió…*.
- **13:11:** בנו singular then ויספרום plural; calqued *su hijo… y las contaron*.

## Not done here

No merge into `translation/ot/1reyes.md`. No STATUS bump. No alignment. Token extracts `_tokens_ch09.txt`…`_tokens_ch13.txt` and `_compact_ch09.txt`… are work aids only.
