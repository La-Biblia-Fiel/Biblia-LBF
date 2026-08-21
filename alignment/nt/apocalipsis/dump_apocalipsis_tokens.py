#!/usr/bin/env python3
"""Dump Apocalipsis TR tokens + current LBF Spanish. Biblia-LBF only.

Working references are Protestant. Never print MT verse labels.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / "tools"))

import status as lbf  # noqa: E402

SPINE = HERE / "apocalipsis-tr-spine.json"
PHRASES = HERE / "apocalipsis-phrases-tr.json"


def dump_chapter(chapter: int) -> str:
    spine = json.loads(SPINE.read_text(encoding="utf-8"))
    phrases = json.loads(PHRASES.read_text(encoding="utf-8"))
    spanish = lbf.parse_verses(ROOT / "translation/nt/apocalipsis.md")
    lines = [f"# Apocalipsis {chapter} — token dump (Protestant)", ""]
    for p in phrases:
        ref = p.get("reference") or ""
        if not ref.endswith(f" {chapter}:") and f" {chapter}:" not in ref.split("Revelation")[-1]:
            continue
        # phrase refs are "Revelation 11:2"
        parts = ref.split()[-1].split(":")
        if len(parts) != 2 or int(parts[0]) != chapter:
            continue
        vs = int(parts[1])
        lines.append(f"## phrase {p['phraseIndex']}  {ref}")
        lines.append(f"ES(phrase): {p.get('spanish') or ''}")
        lines.append(f"ES(verse):  {spanish.get((chapter, vs), '')}")
        lines.append(f"GR: {p.get('greek') or ''}")
        ids = p.get("sourceTokenIds") or []
        verse = spine["verses"].get(f"{chapter}:{vs}", {})
        tokens = {t["sourceTokenId"]: t for t in verse.get("tokens") or []}
        for i, tid in enumerate(ids):
            t = tokens.get(tid, {})
            lines.append(
                f"  [{i}] {tid}  {t.get('greek') or '?'}  "
                f"{t.get('strongs') or ''}  {t.get('robinson') or ''}"
            )
        if not ids:
            lines.append("  (no sourceTokenIds)")
        lines.append("")
    return "\n".join(lines)


def main() -> None:
    chapter = int(sys.argv[1]) if len(sys.argv) > 1 else 11
    text = dump_chapter(chapter)
    out = HERE / f"dump-ch{chapter}.txt"
    out.write_text(text + "\n", encoding="utf-8")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
