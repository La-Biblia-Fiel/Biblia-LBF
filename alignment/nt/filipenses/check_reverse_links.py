#!/usr/bin/env python3
"""Independently check filipenses-reverse-links.json.

Reads only the finished JSON, the spine, and the canonical Spanish. It does not
import the builder, so a bug in the builder cannot hide here. Read-only.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / "tools"))

import status as lbf  # noqa: E402

EXPECTED = 104
AUTO = {"auto", "auto-zip"}
GLOSS = {"gloss", "gloss-match", "gloss-seed", "verse-span-resynchronization"}


def main() -> int:
    links_doc = json.loads((HERE / "filipenses-reverse-links.json").read_text(encoding="utf-8"))
    spine = json.loads((HERE / "filipenses-tr-spine.json").read_text(encoding="utf-8"))
    spanish = lbf.parse_verses(ROOT / "translation/nt/filipenses.md")

    problems: list[str] = []
    links = links_doc.get("links") or []

    by_ref: dict[tuple[int, int], dict] = {}
    for link in links:
        match = re.search(r"(\d+):(\d+)", str(link.get("reference") or ""))
        if not match:
            problems.append(f"link {link.get('phraseIndex')} has no verse reference")
            continue
        key = (int(match.group(1)), int(match.group(2)))
        if key in by_ref:
            problems.append(f"{key[0]}:{key[1]} appears twice")
        by_ref[key] = link

    if len(by_ref) != EXPECTED:
        problems.append(f"covers {len(by_ref)} verses, expected {EXPECTED}")
    for key in sorted(set(spanish) - set(by_ref)):
        problems.append(f"{key[0]}:{key[1]} is in the Spanish but not aligned")
    for key in sorted(set(by_ref) - set(spanish)):
        problems.append(f"{key[0]}:{key[1]} is aligned but not in the Spanish")

    methods = Counter()
    unit_total = 0
    covered_total = 0
    token_total = 0

    for key in sorted(by_ref):
        ch, vs = key
        where = f"{ch}:{vs}"
        link = by_ref[key]
        units = link.get("units") or []
        if not units:
            problems.append(f"{where}: no units")
            continue

        # 1. the units reconstruct the signed Spanish, character for character
        rebuilt = "".join(str(unit.get("surface") or "") for unit in units)
        if rebuilt != spanish[key]:
            problems.append(f"{where}: units do not reconstruct the Spanish")

        # 2. char offsets are contiguous and agree with the surfaces
        cursor = 0
        for unit in units:
            surface = str(unit.get("surface") or "")
            if unit.get("charStart") != cursor or unit.get("charEnd") != cursor + len(surface):
                problems.append(f"{where}: unit {unit.get('unitId')} has wrong char offsets")
            cursor += len(surface)

        # 3. every unit names source tokens, and they belong to this verse
        verse_tokens = {t["sourceTokenId"] for t in spine["verses"][where]["tokens"]}
        token_total += len(verse_tokens)
        used: set[str] = set()
        for unit in units:
            ids = unit.get("sourceTokenIds") or []
            if not ids:
                problems.append(f"{where}: unit {unit.get('unitId')} has no source tokens")
            for token_id in ids:
                if token_id not in verse_tokens:
                    problems.append(f"{where}: unit {unit.get('unitId')} names {token_id}, not a token of this verse")
                used.add(token_id)
            method = str(unit.get("method") or "")
            methods[method] += 1
            if method in AUTO:
                problems.append(f"{where}: unit {unit.get('unitId')} is auto ({method})")
            if method in GLOSS:
                problems.append(f"{where}: unit {unit.get('unitId')} is gloss ({method})")
            unit_total += 1
        covered_total += len(used)
        for token_id in sorted(verse_tokens - used):
            problems.append(f"{where}: TR token {token_id} is covered by no Spanish unit")

    print(f"verses      {len(by_ref)}/{EXPECTED}")
    print(f"units       {unit_total}")
    print(f"TR tokens   {covered_total}/{token_total} covered")
    print(f"methods     {dict(methods)}")

    if problems:
        print(f"\nFAILED — {len(problems)} problem(s)")
        for item in problems[:40]:
            print(f"  {item}")
        return 1
    print("\nOK — every verse reconstructs, every unit is anchored, every TR token is covered")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
