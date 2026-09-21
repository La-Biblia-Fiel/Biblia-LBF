#!/usr/bin/env python3
"""Seed gpt56 drafts from translation/*.md so run_chapter skips OpenAI.

    python3 tools/pipeline/seed_drafts_from_translation.py jeremias
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from books import ROOT, get_book
from draft_lib import DRAFT_SCHEMA, draft_path, write_json
from source_packet import list_verses

VERSE_HEADING = re.compile(r"^###\s+(\d+):(\d+)\s*$")


def parse_translation(slug: str) -> dict[tuple[int, int], str]:
    book = get_book(slug)
    path = ROOT / "translation" / book.testament / f"{book.slug}.md"
    if not path.is_file():
        raise SystemExit(f"missing {path}")
    verses: dict[tuple[int, int], str] = {}
    cur: tuple[int, int] | None = None
    buf: list[str] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        match = VERSE_HEADING.match(line)
        if match:
            if cur is not None:
                verses[cur] = " ".join(buf).strip()
            cur = (int(match.group(1)), int(match.group(2)))
            buf = []
            continue
        if cur is not None and line.strip() and not line.startswith("#") and not line.startswith(">"):
            buf.append(line.strip())
    if cur is not None:
        verses[cur] = " ".join(buf).strip()
    return verses


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("book")
    parser.add_argument("--label", default="gpt56")
    args = parser.parse_args()

    book = get_book(args.book)
    body = parse_translation(args.book)
    written = skipped = empty = 0
    for ch in range(1, 200):
        try:
            verse_list = list_verses(args.book, ch)
        except Exception:
            break
        if not verse_list:
            break
        for vs in verse_list:
            spanish = (body.get((ch, vs)) or "").strip()
            if not spanish:
                empty += 1
                print(f"EMPTY {ch}:{vs}", file=sys.stderr)
                continue
            out = draft_path(args.book, ch, vs, args.label)
            if out.is_file():
                existing = json.loads(out.read_text(encoding="utf-8"))
                if existing.get("spanish") == spanish:
                    skipped += 1
                    continue
            write_json(
                out,
                {
                    "schema": DRAFT_SCHEMA,
                    "drafter": "seeded-from-translation",
                    "label": args.label,
                    "book": book.slug,
                    "reference": f"{book.label} {ch}:{vs}",
                    "chapter": ch,
                    "verse": vs,
                    "spanish": spanish,
                    "units": [],
                    "uncertainties": [],
                    "addedConcepts": [],
                    "droppedUncitedUnits": 0,
                    "seedSource": "translation",
                },
            )
            written += 1
    print(json.dumps({"book": book.slug, "written": written, "skipped": skipped, "empty": empty}))
    return 0 if empty == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
