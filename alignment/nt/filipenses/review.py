#!/usr/bin/env python3
"""Read one chapter (or one verse) of the Filipenses walk, side by side.

    python3 alignment/nt/filipenses/review.py 3       # a chapter
    python3 alignment/nt/filipenses/review.py 3:12    # one verse

Each Spanish unit is printed beside the TR token or tokens it claims, with the
walk-file line number, so a wrong link is one edit away. Read-only.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / "tools"))

import status as lbf  # noqa: E402

UNIT_LINE = re.compile(r"^([\d,\s]+)\|(.*)\|$")


def walk_lines(chapter: int) -> dict[tuple[int, int], list[tuple[int, list[int], str]]]:
    """Verse -> [(line number in the walk file, token indices, surface)]."""
    path = HERE / f"walk-ch{chapter}.txt"
    out: dict[tuple[int, int], list[tuple[int, list[int], str]]] = {}
    ref: tuple[int, int] | None = None
    for number, line in enumerate(path.read_text(encoding="utf-8").split("\n"), start=1):
        head = re.match(r"^#\s*(\d+):(\d+)\s*$", line)
        if head:
            ref = (int(head.group(1)), int(head.group(2)))
            out[ref] = []
            continue
        unit = UNIT_LINE.match(line)
        if unit and ref is not None:
            indices = [int(p) for p in unit.group(1).replace(" ", "").split(",") if p]
            out[ref].append((number, indices, unit.group(2)))
    return out


def approved_by(chapter: int) -> str | None:
    for line in (HERE / f"walk-ch{chapter}.txt").read_text(encoding="utf-8").splitlines():
        mark = re.match(r"^#!approved\s+(.+?)\s*$", line)
        if mark:
            return mark.group(1)
    return None


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    target = sys.argv[1]
    verse_filter: int | None = None
    if ":" in target:
        chapter_text, verse_text = target.split(":", 1)
        chapter, verse_filter = int(chapter_text), int(verse_text)
    else:
        chapter = int(target)
    if chapter not in (1, 2, 3, 4):
        print("Filipenses has chapters 1 to 4")
        return 2

    spine = json.loads((HERE / "filipenses-tr-spine.json").read_text(encoding="utf-8"))
    spanish = lbf.parse_verses(ROOT / "translation/nt/filipenses.md")
    walk = walk_lines(chapter)

    mark = approved_by(chapter)
    state = f"approved by {mark}  →  method hand" if mark else "not approved  →  method model-walk"
    print(f"Filipenses {chapter} — walk-ch{chapter}.txt — {state}\n")

    for key in sorted(walk):
        if verse_filter is not None and key[1] != verse_filter:
            continue
        ch, vs = key
        ref = f"{ch}:{vs}"
        tokens = spine["verses"][ref]["tokens"]
        print(f"{'─' * 4} {ref} {'─' * 64}")
        print(f"  GR  {spine['verses'][ref]['trText']}")
        print(f"  ES  {spanish.get(key, '(falta)')}")
        print()
        used: set[int] = set()
        for line_number, indices, surface in walk[key]:
            used.update(indices)
            greek = " ".join(tokens[i - 1]["greek"] for i in indices if 1 <= i <= len(tokens))
            morph = " ".join(tokens[i - 1]["robinson"] for i in indices if 1 <= i <= len(tokens))
            shown = surface.replace(" ", "·") if surface != surface.strip() else surface
            print(f"    L{line_number:<5} {','.join(str(i) for i in indices):<7} "
                  f"{shown:<34} {greek:<26} {morph}")
        missed = [i for i in range(1, len(tokens) + 1) if i not in used]
        if missed:
            shown = ", ".join(f"{i} {tokens[i - 1]['greek']}" for i in missed)
            print(f"    !!    no Spanish unit claims: {shown}")
        print()
    print("· marks a space in the surface. Surfaces must still join to the Spanish exactly.")
    print(f"Edit walk-ch{chapter}.txt, then: python3 alignment/nt/filipenses/build_filipenses_reverse_links.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
