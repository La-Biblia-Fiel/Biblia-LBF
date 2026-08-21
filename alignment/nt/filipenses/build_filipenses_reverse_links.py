#!/usr/bin/env python3
"""Assemble filipenses-reverse-links.json from the per-chapter walk files.

The walk files (walk-ch1.txt … walk-ch4.txt) are the editable record. Each
Spanish unit is one line:

    3,4|surface |

left of the bar: TR token indices within that verse (1-based, as printed in
dump-ch*.txt); right of the bar: the exact Spanish surface, closing bar making
trailing spaces visible.

A chapter is written with method `model-walk` — which tools/status.py counts as
neither hand nor auto — until a person puts a line at the top of that walk file:

    #!approved John Wry 2026-08-20

Only then are that chapter's units written with method `hand`. This script
writes no state and never touches STATUS.md.
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

SPINE = HERE / "filipenses-tr-spine.json"
OUT = HERE / "filipenses-reverse-links.json"
UNWALKED = "model-walk"
WALKED = "hand"
UNIT_LINE = re.compile(r"^([\d,\s]+)\|(.*)\|$")
APPROVAL = re.compile(r"^#!approved\s+(.+?)\s*$")


def read_walks() -> tuple[dict[tuple[int, int], list[tuple[list[int], str]]], dict[int, str]]:
    walks: dict[tuple[int, int], list[tuple[list[int], str]]] = {}
    approvals: dict[int, str] = {}
    for chapter in (1, 2, 3, 4):
        path = HERE / f"walk-ch{chapter}.txt"
        if not path.is_file():
            continue
        ref: tuple[int, int] | None = None
        for number, line in enumerate(path.read_text(encoding="utf-8").split("\n"), start=1):
            head = re.match(r"^#\s*(\d+):(\d+)\s*$", line)
            if head:
                ref = (int(head.group(1)), int(head.group(2)))
                if ref in walks:
                    raise SystemExit(f"{path.name}:{number}: {ref[0]}:{ref[1]} appears twice")
                walks[ref] = []
                continue
            approval = APPROVAL.match(line)
            if approval:
                approvals[chapter] = approval.group(1)
                continue
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            unit = UNIT_LINE.match(line)
            if not unit:
                raise SystemExit(f"{path.name}:{number}: cannot parse {line!r}")
            if ref is None:
                raise SystemExit(f"{path.name}:{number}: unit before any verse heading")
            indices = [int(part) for part in unit.group(1).replace(" ", "").split(",") if part]
            walks[ref].append((indices, unit.group(2)))
    return walks, approvals


def main() -> int:
    spine = json.loads(SPINE.read_text(encoding="utf-8"))
    spanish = lbf.parse_verses(ROOT / "translation/nt/filipenses.md")
    walks, approvals = read_walks()

    errors: list[str] = []
    links = []
    covered_total = 0
    token_total = 0
    uncovered: list[str] = []

    for phrase_index, key in enumerate(sorted(spanish)):
        ch, vs = key
        ref = f"{ch}:{vs}"
        verse = spine["verses"].get(ref)
        if verse is None:
            errors.append(f"{ref}: no TR verse in the spine")
            continue
        tokens = verse["tokens"]
        token_total += len(tokens)
        units = walks.get(key)
        if not units:
            errors.append(f"{ref}: not walked")
            continue

        rebuilt = "".join(surface for _, surface in units)
        if rebuilt != spanish[key]:
            errors.append(f"{ref}: units do not reconstruct the Spanish")
            errors.append(f"    walk : {rebuilt!r}")
            errors.append(f"    text : {spanish[key]!r}")

        method = WALKED if ch in approvals else UNWALKED
        used: set[int] = set()
        out_units = []
        cursor = 0
        for unit_index, (indices, surface) in enumerate(units):
            ids = []
            for index in indices:
                if not 1 <= index <= len(tokens):
                    errors.append(f"{ref} unit {unit_index}: token {index} out of range 1..{len(tokens)}")
                    continue
                used.add(index)
                ids.append(tokens[index - 1]["sourceTokenId"])
            if not ids:
                errors.append(f"{ref} unit {unit_index}: no source tokens")
            out_units.append(
                {
                    "unitId": f"{phrase_index}:{unit_index}",
                    "surface": surface,
                    "charStart": cursor,
                    "charEnd": cursor + len(surface),
                    "sourceTokenIds": ids,
                    "method": method,
                }
            )
            cursor += len(surface)

        covered_total += len(used)
        missed = [index for index in range(1, len(tokens) + 1) if index not in used]
        if missed:
            shown = ", ".join("{}={}".format(i, tokens[i - 1]["greek"]) for i in missed)
            uncovered.append(f"{ref}: {shown}")

        links.append(
            {
                "phraseIndex": phrase_index,
                "reference": f"Filipenses {ref}",
                "status": method,
                "units": out_units,
            }
        )

    document = {
        "bookId": "filipenses",
        "textualBasis": "Scrivener 1894 TR",
        "schemaVersion": 1,
        "numbering": "protestant",
        "notes": {
            "provenance": "Assembled by a model walking the TR token by token against "
                          "the signed Spanish, 2026-08-19. A chapter carries method "
                          "`model-walk` — counted by tools/status.py as neither hand nor "
                          "auto — until a person marks that walk file `#!approved`.",
            "approved": {f"chapter {c}": who for c, who in sorted(approvals.items())} or
                        "no chapter approved yet",
            "notAutoZip": "No zip, no gloss DP, no whole-book auto-align was run. Units "
                          "were written one at a time in walk-ch1.txt … walk-ch4.txt, "
                          "which remain the editable record.",
            "spine": "filipenses-tr-spine.json, built from robinson-parsed/PHP.UTR and "
                     "cross-checked token for token against scrivener-textonly/PHP.SCV.",
            "toApprove": "python3 review.py <chapter>, fix what is wrong in walk-ch<n>.txt, "
                         "rebuild, then add `#!approved <name> <ISO date>` at the top of "
                         "that walk file and rebuild again.",
        },
        "stats": {
            "verses": len(links),
            "units": sum(len(link["units"]) for link in links),
            "trTokens": token_total,
            "trTokensCovered": covered_total,
            "unitsHand": sum(1 for link in links for unit in link["units"] if unit["method"] == WALKED),
            "unitsModelWalk": sum(1 for link in links for unit in link["units"] if unit["method"] == UNWALKED),
        },
        "links": links,
    }

    if errors:
        print("PROBLEMS")
        for item in errors:
            print(f"  {item}")
    OUT.write_text(json.dumps(document, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    print(json.dumps(document["stats"], indent=1))
    for chapter in (1, 2, 3, 4):
        who = approvals.get(chapter)
        print(f"  chapter {chapter}  {'approved by ' + who if who else 'not approved — method model-walk'}")
    if uncovered:
        print(f"\nTR tokens with no Spanish unit ({len(uncovered)} verses):")
        for item in uncovered:
            print(f"  {item}")
    print(f"\nwrote {OUT.relative_to(ROOT)}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
