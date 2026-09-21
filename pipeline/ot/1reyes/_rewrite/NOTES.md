# 1 Reyes 1–5 — second-pass rewrite notes

**Verse count:** 179 (1:53 + 2:46 + 3:28 + 4:34 + 5:18). Matches Protestant packet files (`1reyes-{c}-{v}.packet.json`). MT labels differ from Protestant in ch. 4–5 (e.g. Prot. 4:21 = OSHB `1Kgs.5.1`; Prot. 5:1 = OSHB `1Kgs.5.15`); chapter files follow Protestant labels.

**Output:** `pipeline/ot/1reyes/_rewrite/ch01.md` … `ch05.md` only. No `translation/*.md`, no `STATUS.md`.

## Method

Hand calque from each OSHB packet (surface + morph). Jehová / Mizraim / *ustedes*. Not gloss DP, not machine zip, not Ollama polish. Voice aligned with `pipeline/ot/2samuel/_rewrite/` and `1samuel/_rewrite/`.

## Name forms used

| Form | Not |
| --- | --- |
| David, Shelomó, Bat-Shéva, Adoniyá, Jaguit | Salomón, Betsabé, Adonías |
| Avishag, shunamit; Avshalom | Abisag, Absalón |
| Yoav, Tseruyá, Evyatar, Tsadóq, Natán | Joab, Abiatar, Sadoc |
| Benayahu, Yehoyadá; Shimí, Reí, Yonatán | Joiada, Jonatán |
| Guijón, Ein Roguel, Even ha-Zojélet | En-rogel, Zohelet |
| keretí, peletí; Yerushaláyim, Yehudá | Jerusalén / Judá |
| Barzilai, Guerá, yeminí, Bajurim, Majanáyim, Yardén | — |
| Anatot, Elí, Shiló; Ajish, Maaká, Gat | Anatot / Silo |
| Faraón, Mizraim; Givón; bamá / bamot, olá / olot, shelamím | Egipto |
| Jiram, Tsor, Levanón, tsidonim, guivlim | Hiram, Tiro, Líbano |
| nitsavim, mas, kor, mashal, naguíd, shofar, midbar, satán | — |

District officers kept as *Ben-X* (Ben-Jur, Ben-Déqer, Ben-Jésed, Ben-Avinadav, Ben-Guéver). Place list in ch. 4 follows OSHB surfaces Hebraized (Taanak, Meguidó, Bet Sheán, Ramot Gilad, Tipsaj, Azá, Beer Sheva, etc.).

Proposed locks not yet in `PROPER_NAMES.md` seed: Shelomó, Bat-Shéva, Adoniyá, Avishag, Guijón, Jiram, Tsor, Even ha-Zojélet, Ein Roguel, and the ch. 4 nitsav roster. Orthography follows 2 Samuel rewrite spine where attested.

## Open / tight spots

- **1:2:** סכנת → *sokenet* (attendant; left as technical participle).
- **1:2:** בחיקך 2ms address to the king kept (*en tu seno*).
- **2:6 / 2:9:** שאול → *sheol* (underworld).
- **2:26:** אדני יהוה → *Adonai Jehová*.
- **3:10 / 3:15:** אדני → *Adonai*.
- **4:28:** רכש → *réjesh* (royal horse stock; left open).
- **4:32:** משל → *mashal*; song count *cinco y mil* (packet 5+1000).
- **5:3:** Packet ends at כפות (no רגליו); calqued *debajo de palmas—*.
- **5:4:** שטן → *satán* (opponent), not interpretive “Satan” title.
- **5:9:** דברות → *dovrot* (sea-rafts).
- **5:10 / 5:18:** Packet חירום same referent as חירם → *Jiram*.
- **5:17:** גזית → *gazit* (hewn stone).

## Not done here

No merge into `translation/ot/1reyes.md`. No STATUS bump. No alignment. Token extracts `_tokens_ch01.txt`…`_tokens_ch05.txt` are work aids only.
