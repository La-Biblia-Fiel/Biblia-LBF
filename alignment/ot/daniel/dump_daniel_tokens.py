#!/usr/bin/env python3
"""Dump Daniel OSHB tokens + LBF Spanish. Biblia-LBF only.

Working references are Protestant. Token ids may encode WLC digits.
Never print MT verse labels. Do not use spine `es` glosses as the map.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path("/Users/johnwry/Nextcloud/Documents/GitHub/Biblia-LBF")
SPINE = ROOT / "alignment/ot/daniel/daniel-oshb-spine.json"
SPANISH = ROOT / "translation/ot/daniel.md"
OUT_DIR = ROOT / "alignment/ot/daniel"


def parse_spanish() -> dict[tuple[int, int], str]:
    text = SPANISH.read_text(encoding="utf-8")
    out: dict[tuple[int, int], str] = {}
    matches = list(re.finditer(r"^### (\d+):(\d+)\n\n(.+?)(?=\n\n### |\n\n## |\Z)", text, re.M | re.S))
    for m in matches:
        ch, vs, body = int(m.group(1)), int(m.group(2)), m.group(3).strip()
        body = re.sub(r"\s+", " ", body)
        out[(ch, vs)] = body
    return out


def load_phrases() -> list[dict]:
    spine = json.loads(SPINE.read_text(encoding="utf-8"))
    spanish = parse_spanish()
    phrases: list[dict] = []
    for idx, (key, verse) in enumerate(spine["verses"].items()):
        ch = int(verse["ch"])
        vs = int(verse["vs"])
        rows = []
        for tok in verse["tokens"]:
            rows.append(
                {
                    "sourceTokenId": tok["sourceTokenId"],
                    "surface": tok["surface"].replace("/", ""),
                    "lemma": tok.get("lemma") or "",
                    "morph": tok.get("morph") or "",
                    "lang": tok.get("lang") or "",
                    "oshbId": tok.get("oshbId") or "",
                }
            )
        es = spanish.get((ch, vs), "")
        phrases.append(
            {
                "phraseIndex": idx,
                "reference": f"Daniel {ch}:{vs}",
                "chapter": ch,
                "verse": vs,
                "spanish": es,
                "hebrew": " ".join(r["surface"] for r in rows),
                "sourceTokenIds": [r["sourceTokenId"] for r in rows],
                "tokenRows": rows,
                "textualBasis": "OSHB/WLC",
            }
        )
    return phrases


def dump_chapter(phrases: list[dict], chapter: int) -> str:
    lines = [f"# Daniel {chapter} — token dump (Protestant)", ""]
    for p in phrases:
        if p["chapter"] != chapter:
            continue
        lines.append(f"## phrase {p['phraseIndex']}  {p['reference']}")
        lines.append(f"ES: {p['spanish']}")
        lines.append(f"HE: {p['hebrew']}")
        for i, r in enumerate(p["tokenRows"]):
            lang = r["lang"]
            lines.append(
                f"  [{i}] {r['sourceTokenId']}  {r['surface']}  lemma={r['lemma']}  {r['morph']}  {lang}"
            )
        lines.append("")
    return "\n".join(lines)


def main() -> None:
    chapter = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    phrases = load_phrases()
    (OUT_DIR / "daniel-phrases.json").write_text(
        json.dumps(phrases, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    dump = dump_chapter(phrases, chapter)
    out = OUT_DIR / f"dump-ch{chapter}.txt"
    out.write_text(dump, encoding="utf-8")
    ch = [p for p in phrases if p["chapter"] == chapter]
    print(
        f"phrases={len(phrases)} ch{chapter}={len(ch)} "
        f"first={ch[0]['phraseIndex']} last={ch[-1]['phraseIndex']}"
    )
    print(f"wrote {OUT_DIR / 'daniel-phrases.json'}")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
