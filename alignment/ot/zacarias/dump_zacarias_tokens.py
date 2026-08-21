#!/usr/bin/env python3
"""Dump Zacarías OSHB tokens + LBF Spanish. Biblia-LBF only.

Working references are Protestant. Token ids may encode WLC digits.
Never print MT verse labels.
"""
from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path("/Users/johnwry/Nextcloud/Documents/GitHub/Biblia-LBF")
XML = ROOT / "source/hebrew/OSHB/morphhb/wlc/Zech.xml"
SPANISH = ROOT / "translation/ot/zacarias.md"
OUT_DIR = ROOT / "alignment/ot/zacarias"
NS = {"o": "http://www.bibletechnologies.net/2003/OSIS/namespace"}
BOOK = 38


def protestant(oshb_ch: int, oshb_vs: int) -> tuple[int, int]:
    """OSHB/WLC chapter-verse → LBF/Protestant chapter-verse."""
    if oshb_ch == 1:
        return 1, oshb_vs
    if oshb_ch == 2:
        if oshb_vs <= 4:
            return 1, 17 + oshb_vs
        return 2, oshb_vs - 4
    return oshb_ch, oshb_vs


def token_id(oshb_ch: int, oshb_vs: int, token_n: int) -> str:
    return f"h{BOOK:02d}{oshb_ch:03d}{oshb_vs:03d}{token_n:03d}"


def parse_spanish() -> dict[tuple[int, int], str]:
    text = SPANISH.read_text(encoding="utf-8")
    out: dict[tuple[int, int], str] = {}
    matches = list(re.finditer(r"^### (\d+):(\d+)\n\n(.+?)(?=\n\n### |\n\n## |\Z)", text, re.M | re.S))
    for m in matches:
        ch, vs, body = int(m.group(1)), int(m.group(2)), m.group(3).strip()
        body = re.sub(r"\s+", " ", body)
        out[(ch, vs)] = body
    return out


def verse_words(verse: ET.Element) -> list[ET.Element]:
    words: list[ET.Element] = []
    for child in verse:
        tag = child.tag.split("}")[-1]
        if tag == "w" and child.get("type") != "x-ketiv":
            words.append(child)
        elif tag == "note" and child.get("type") == "variant":
            rdg = child.find("o:rdg", NS)
            if rdg is not None:
                w = rdg.find("o:w", NS)
                if w is not None:
                    words.append(w)
    return words


def surface(w: ET.Element) -> str:
    raw = "".join(w.itertext()).strip()
    return raw.replace("/", "")


def load_phrases() -> list[dict]:
    spanish = parse_spanish()
    tree = ET.parse(XML)
    root = tree.getroot()
    phrases: list[dict] = []
    idx = 0
    for verse in root.findall(".//o:verse", NS):
        osis = verse.get("osisID") or ""
        parts = osis.split(".")
        oshb_ch, oshb_vs = int(parts[1]), int(parts[2])
        pch, pvs = protestant(oshb_ch, oshb_vs)
        rows = []
        for n, w in enumerate(verse_words(verse), start=1):
            rows.append(
                {
                    "sourceTokenId": token_id(oshb_ch, oshb_vs, n),
                    "surface": surface(w),
                    "lemma": w.get("lemma") or "",
                    "morph": w.get("morph") or "",
                    "oshbId": w.get("id") or "",
                }
            )
        es = spanish.get((pch, pvs), "")
        phrases.append(
            {
                "phraseIndex": idx,
                "reference": f"Zacarías {pch}:{pvs}",
                "chapter": pch,
                "verse": pvs,
                "spanish": es,
                "hebrew": " ".join(r["surface"] for r in rows),
                "sourceTokenIds": [r["sourceTokenId"] for r in rows],
                "tokenRows": rows,
                "textualBasis": "OSHB/WLC",
            }
        )
        idx += 1
    return phrases


def dump_chapter(phrases: list[dict], chapter: int) -> str:
    lines = [f"# Zacarías {chapter} — token dump (Protestant)", ""]
    for p in phrases:
        if p["chapter"] != chapter:
            continue
        lines.append(f"## phrase {p['phraseIndex']}  {p['reference']}")
        lines.append(f"ES: {p['spanish']}")
        lines.append(f"HE: {p['hebrew']}")
        for i, r in enumerate(p["tokenRows"]):
            lines.append(f"  [{i}] {r['sourceTokenId']}  {r['surface']}  lemma={r['lemma']}  {r['morph']}")
        lines.append("")
    return "\n".join(lines)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    phrases = load_phrases()
    (OUT_DIR / "zacarias-phrases.json").write_text(
        json.dumps(phrases, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    dump = dump_chapter(phrases, 1)
    (OUT_DIR / "dump-ch1.txt").write_text(dump, encoding="utf-8")
    ch1 = [p for p in phrases if p["chapter"] == 1]
    print(f"phrases={len(phrases)} ch1={len(ch1)} first={ch1[0]['phraseIndex']} last={ch1[-1]['phraseIndex']}")
    print(f"wrote {OUT_DIR / 'zacarias-phrases.json'}")
    print(f"wrote {OUT_DIR / 'dump-ch1.txt'}")


if __name__ == "__main__":
    main()
