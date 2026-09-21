# 2 Samuel 1–6 — second-pass rewrite notes

**Verse count:** 158 (1:27 + 2:32 + 3:39 + 4:12 + 5:25 + 6:23). Matches packet files.

**Output:** `pipeline/ot/2samuel/_rewrite/ch01.md` … `ch06.md` only. No `translation/*.md`, no `STATUS.md`.

## Method

Hand calque from each `2samuel-{c}-{v}.packet.json` (OSHB surface + morph). Jehová / Mizraim / *ustedes*. Not gloss DP, not machine zip, not Ollama polish. Voice aligned with `pipeline/ot/1samuel/_rewrite/`.

## Name forms used

| Form | Not |
| --- | --- |
| Shaúl, David, Yehonatán | Saúl, Jonatán |
| Avner, Ner, Yoav, Avishai, Tseruyá, Asáel | Abner, Joab, Abisai, Asael |
| Ish-Bóshet, Mefibóshet | Isboset, Mefiboset |
| Ajinoam, Avigáyil, Naval, Mikal | Abigail, Mical |
| Amnón, Kilav, Avshalom, Adoniyá, Jaguit, Shefatyá, Avital, Yitream, Eglá | — |
| Maaká, Talmai, Geshur, Ritsapá, Ayá | — |
| Hevrón, Majanáyim, Givón, Yavesh Gilad, Yizreel, Bet Léjem | Hebrón / Jabés |
| Tsiklag, ha-Gilboa, Amaleq / amaleqí, Gat, Ashqelón | — |
| Yerushaláyim, Tsiyón, ha-Miló, Baal Peratsim, Géva, Gézer | Jerusalén / Sion |
| Avinadav, Uzá, Ajyó, Oved Edom, Baalé Yehudá, Nakhón, Perets Uzá | — |
| pelishtim, Yehudá, Binyamín, Efráyim, Beer Sheva, Dan | filisteos / Judá |
| naguíd, bamá / bamot, qiná, tsví, shofar, efod, shelamím, olá | — |

Proposed locks not yet in `PROPER_NAMES.md` seed: Ish-Bóshet, Mefibóshet, Asáel, Avshalom, Adoniyá, Ritsapá, Majanáyim, Givón, Yerushaláyim, Tsiyón, Baal Peratsim, Oved Edom, Uzá, Ajyó, Perets Uzá, Helqat ha-Tsurim, Givát Amá, Gíaj, ha-Bitron, Bajurim, Beerot / beerotí. Orthography follows 1 Samuel rewrite spine where attested.

## Open / tight spots

- **1:6:** נקרא נקריתי → *Encontrándome encontré* (niphal + cognate).
- **1:9:** השבץ → *el shaváts* (left open; rare medical/cramp term).
- **1:18–19:** ספר הישר → *sefer ha-Yashár*; הצבי → *el tsví* (gazelle, not “gloria”).
- **1:21:** בלי משיח בשמן → *sin ungido en el aceite*.
- **2:9:** האשורי left *ha-ashurí* (packet gentilic; not emended to geshurí).
- **3:7:** Packet has no named subject for ויאמר; calqued *Y dijo a Avner*.
- **3:15:** Packet ends at בן (no Layish); left *Paltiél hijo—*.
- **3:25:** Packet has וְאֶת hanging (no מוֹבָאֲךָ); left *tu salida y —*.
- **4:6:** הנה fem. + באו → *he aquí ellas vinieron* (packet morphology).
- **5:2:** Packet lacks המוציא והמביא; left *tú a Israel* then Jehová speech.
- **5:8:** Tight calque of tsinnor / lame-blind / *alma de David* (notorious crux).
- **6:1:** וַיֹּסֶף tagged H622 → *reunió*, not “añadió”.
- **6:7:** על השל → *sobre el shal* (left open).

## Not done here

No merge into `translation/ot/2samuel.md`. No STATUS bump. No alignment. Token extracts `_tokens_ch01.txt`…`_tokens_ch06.txt` are work aids only.
