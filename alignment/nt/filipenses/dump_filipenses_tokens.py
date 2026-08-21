#!/usr/bin/env python3
"""Write one walking worksheet per chapter of Filipenses.

Each verse prints its TR tokens (id tail, accented Greek, Strong's, Robinson
tag) beside the Spanish of translation/nt/filipenses.md, so the verse can be
walked token by token. Read-only; writes only dump-ch*.txt beside this script.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / "tools"))

import status as lbf  # noqa: E402

SPINE = HERE / "filipenses-tr-spine.json"


def main() -> int:
    spine = json.loads(SPINE.read_text(encoding="utf-8"))
    spanish = lbf.parse_verses(ROOT / "translation/nt/filipenses.md")

    chapters: dict[int, list[str]] = {}
    for ref, verse in spine["verses"].items():
        ch, vs = verse["ch"], verse["vs"]
        lines = chapters.setdefault(ch, [])
        lines.append(f"=== {ref} ===")
        lines.append(f"GR  {verse['trText']}")
        lines.append(f"ES  {spanish.get((ch, vs), '(FALTA)')}")
        for token in verse["tokens"]:
            lines.append(
                f"  {token['trIndex']:>3}  {token['sourceTokenId']}  "
                f"{token['greek']:<18} {token['strongs']:<7} {token['robinson']}"
            )
        lines.append("")

    for ch, lines in sorted(chapters.items()):
        out = HERE / f"dump-ch{ch}.txt"
        out.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"wrote {out.name} ({len(lines)} lines)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
