#!/usr/bin/env python3
"""Dump Génesis OSHB tokens + LBF Spanish. Biblia-LBF only.

Working references are Protestant. Token ids may encode WLC digits.
Never print MT verse labels.
"""
from __future__ import annotations

import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path("/Users/johnwry/Nextcloud/Documents/GitHub/Biblia-LBF")
XML = ROOT / "source/hebrew/OSHB/morphhb/wlc/Gen.xml"
SPANISH = ROOT / "translation/ot/genesis.md"
OUT_DIR = ROOT / "alignment/ot/genesis"
NS = {"o": "http://www.bibletechnologies.net/2003/OSIS/namespace"}
BOOK = 1


def protestant(oshb_ch: int, oshb_vs: int) -> tuple[int, int]:
    """OSHB/WLC chapter-verse → LBF/Protestant chapter-verse."""
    if oshb_ch == 32:
        if oshb_vs == 1:
            return 31, 55
        return 32, oshb_vs - 1
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
    spanish = parse_spanish() if SPANISH.is_file() else {}
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
                "reference": f"Génesis {pch}:{pvs}",
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
    lines = [f"# Génesis {chapter} — token dump (Protestant)", ""]
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
    chapter = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    phrases = load_phrases()
    (OUT_DIR / "genesis-phrases.json").write_text(
        json.dumps(phrases, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    dump = dump_chapter(phrases, chapter)
    out = OUT_DIR / f"dump-ch{chapter}.txt"
    out.write_text(dump, encoding="utf-8")
    ch = [p for p in phrases if p["chapter"] == chapter]
    print(f"phrases={len(phrases)} ch{chapter}={len(ch)} first={ch[0]['phraseIndex']} last={ch[-1]['phraseIndex']}")
    print(f"wrote {OUT_DIR / 'genesis-phrases.json'}")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
