#!/usr/bin/env python3
"""Cross-check the Filipenses spine against the unparsed Scrivener text.

The spine's tokens come from robinson-parsed/PHP.UTR. This compares that token
sequence, verse by verse, against scrivener-textonly/PHP.SCV, which is an
independent transcription of the same edition. Read-only.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SCV = ROOT / "source/greek/TR1894/scrivener-textonly/PHP.SCV"
SPINE = Path(__file__).resolve().parent / "filipenses-tr-spine.json"

# PHP.UTR beta: q=theta, y=psi. PHP.SCV beta: y=theta, q=psi.
SCV_SWAP = str.maketrans({"y": "q", "q": "y"})


def read_scv() -> dict[str, list[str]]:
    raw = SCV.read_text(encoding="utf-8", errors="replace").replace("\r\n", "\n")
    verses: dict[str, list[str]] = {}
    ref: str | None = None
    for line in raw.split("\n"):
        # Strip the bracketed running title / subscription.
        line = re.sub(r"\[[^\]]*\]", " ", line)
        for piece in line.split():
            head = re.match(r"^(\d+):(\d+)$", piece)
            if head:
                ref = f"{int(head.group(1))}:{int(head.group(2))}"
                verses[ref] = []
                continue
            word = re.sub(r"[^a-z]", "", piece.lower())
            if word and ref is not None:
                verses[ref].append(word.translate(SCV_SWAP))
    return verses


def main() -> int:
    spine = json.loads(SPINE.read_text(encoding="utf-8"))
    scv = read_scv()
    problems = 0
    for ref, verse in spine["verses"].items():
        mine = [t["beta"] for t in verse["tokens"]]
        theirs = scv.get(ref)
        if theirs is None:
            print(f"{ref}: absent from PHP.SCV")
            problems += 1
            continue
        if mine != theirs:
            problems += 1
            print(f"{ref}: token sequence differs")
            for index in range(max(len(mine), len(theirs))):
                a = mine[index] if index < len(mine) else "—"
                b = theirs[index] if index < len(theirs) else "—"
                if a != b:
                    print(f"    {index + 1}: UTR {a!r} vs SCV {b!r}")
                    break
    extra = sorted(set(scv) - set(spine["verses"]))
    if extra:
        print(f"in PHP.SCV but not in the spine: {extra}")
        problems += 1
    print(f"\n{len(spine['verses'])} verses checked, {problems} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
