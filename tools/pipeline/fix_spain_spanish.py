#!/usr/bin/env python3
"""Replace Spain 2pl forms with Latin American ustedes forms in drafts/translation.

Does not call APIs. Does not touch STATUS.md.

    python3 tools/pipeline/fix_spain_spanish.py jeremias --from-chapter 10
    python3 tools/pipeline/fix_spain_spanish.py jeremias --translation-only
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from books import ROOT, get_book
from draft_lib import draft_path
from source_packet import list_verses

# Order matters: longer / more specific first.
REPLACEMENTS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bvosotras\b", re.I), "ustedes"),
    (re.compile(r"\bvosotros\b", re.I), "ustedes"),
    (re.compile(r"\bvuestras\b", re.I), "sus"),
    (re.compile(r"\bvuestros\b", re.I), "sus"),
    (re.compile(r"\bvuestra\b", re.I), "su"),
    (re.compile(r"\bvuestro\b", re.I), "su"),
    (re.compile(r"\bhagáis\b", re.I), "hagan"),
    (re.compile(r"\bharéis\b", re.I), "harán"),
    (re.compile(r"\bhabéis\b", re.I), "han"),
    (re.compile(r"\btenéis\b", re.I), "tienen"),
    (re.compile(r"\bveréis\b", re.I), "verán"),
    (re.compile(r"\bveáis\b", re.I), "vean"),
    (re.compile(r"\basistáis\b", re.I), "asistan"),
    (re.compile(r"\bmataréis\b", re.I), "matarán"),
    (re.compile(r"\bseréis\b", re.I), "serán"),
    (re.compile(r"\bsois\b", re.I), "son"),
    (re.compile(r"\bestáis\b", re.I), "están"),
    (re.compile(r"\bandáis\b", re.I), "andan"),
]


def fix_spain(text: str) -> tuple[str, int]:
    out = text
    n = 0
    for pattern, repl in REPLACEMENTS:
        out, c = pattern.subn(repl, out)
        n += c
    return out, n


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("book")
    parser.add_argument("--from-chapter", type=int, default=1)
    parser.add_argument("--to-chapter", type=int, default=None)
    parser.add_argument("--translation-only", action="store_true")
    parser.add_argument("--drafts-only", action="store_true")
    args = parser.parse_args()
    book = get_book(args.book)
    last = args.to_chapter
    if last is None:
        last = 0
        for ch in range(1, 200):
            try:
                vs = list_verses(args.book, ch)
            except Exception:
                break
            if not vs:
                break
            last = ch

    total = 0
    if not args.drafts_only:
        path = ROOT / "translation" / book.testament / f"{book.slug}.md"
        if path.is_file():
            text = path.read_text(encoding="utf-8")
            fixed, n = fix_spain(text)
            if n:
                path.write_text(fixed, encoding="utf-8")
            print(f"translation replacements={n}")
            total += n
            if args.translation_only:
                return 0

    if not args.translation_only:
        files = 0
        for ch in range(args.from_chapter, last + 1):
            for vs in list_verses(args.book, ch):
                path = draft_path(args.book, ch, vs, "gpt56")
                if not path.is_file():
                    continue
                data = json.loads(path.read_text(encoding="utf-8"))
                sp = data.get("spanish") or ""
                fixed, n = fix_spain(sp)
                if not n:
                    continue
                data["spainFix"] = True
                data["spanish"] = fixed
                path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                total += n
                files += 1
        print(f"draft files touched={files} replacements={total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
