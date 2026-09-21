#!/usr/bin/env python3
"""Run one OT book chapter-by-chapter via scripts (economy polish=warn).

    python3 tools/pipeline/run_book.py jeremias
    python3 tools/pipeline/run_book.py jeremias --from-chapter 1 --to-chapter 52

Resume-safe. Does not write translation/*.md or STATUS.md.
Agent is not invoked — holds stay parked under pipeline/ot/<book>/_logs/.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from books import ROOT, get_book
from source_packet import list_verses


def chapter_count(slug: str) -> int:
    n = 0
    for ch in range(1, 200):
        try:
            verses = list_verses(slug, ch)
        except Exception:
            break
        if not verses:
            break
        n = ch
    return n


def roll_holds(slug: str, log_dir: Path) -> dict:
    book = get_book(slug)
    holds: list[dict] = []
    passed = errors = chapters = 0
    for ch in range(1, chapter_count(slug) + 1):
        path = ROOT / "pipeline" / book.testament / book.slug / f"{book.slug}-{ch}.queue.json"
        if not path.is_file():
            continue
        chapters += 1
        queue = json.loads(path.read_text(encoding="utf-8"))
        passed += len(queue.get("passed") or [])
        errors += len(queue.get("errors") or [])
        for item in queue.get("holds") or []:
            holds.append(
                {
                    "ref": f"{ch}:{item.get('verse')}",
                    "chapter": ch,
                    "verse": item.get("verse"),
                    "stage": item.get("stage"),
                    "verdict": item.get("verdict"),
                    "spanish": item.get("spanish") or "",
                    "notes": item.get("notes") or "",
                    "findings": item.get("findings") or [],
                }
            )
    payload = {
        "book": book.slug,
        "mode": "scripts-only; agent reserved for parked holds",
        "chaptersWithQueues": chapters,
        "passedVerses": passed,
        "errorVerses": errors,
        "holdCount": len(holds),
        "holds": holds,
    }
    out = log_dir / "parked-holds.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"chapters={chapters}/{chapter_count(slug)} passed={passed} holds={len(holds)} errors={errors}",
        flush=True,
    )
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("book")
    parser.add_argument("--from-chapter", type=int, default=1)
    parser.add_argument("--to-chapter", type=int, default=None)
    args = parser.parse_args()

    book = get_book(args.book)
    last = args.to_chapter or chapter_count(args.book)
    log_dir = ROOT / "pipeline" / book.testament / book.slug / "_logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    summary = log_dir / "summary.jsonl"

    print(f"start {book.slug} ch {args.from_chapter}–{last} {datetime.now(timezone.utc).isoformat()}", flush=True)
    for ch in range(args.from_chapter, last + 1):
        print(f"=== chapter {ch} ===", flush=True)
        proc = subprocess.run(
            [sys.executable, str(ROOT / "tools/pipeline/run_chapter.py"), book.slug, str(ch)],
            cwd=str(ROOT),
        )
        qpath = ROOT / "pipeline" / book.testament / book.slug / f"{book.slug}-{ch}.queue.json"
        row: dict = {
            "chapter": ch,
            "exit": proc.returncode,
            "at": datetime.now(timezone.utc).isoformat(),
        }
        if qpath.is_file():
            queue = json.loads(qpath.read_text(encoding="utf-8"))
            row["passedCount"] = len(queue.get("passed") or [])
            row["holds"] = [h.get("verse") for h in (queue.get("holds") or [])]
            row["errors"] = [e.get("verse") for e in (queue.get("errors") or [])]
            row["usage"] = queue.get("usage") or {}
        with summary.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")
        print(json.dumps(row, ensure_ascii=False), flush=True)
        roll_holds(book.slug, log_dir)
        if proc.returncode != 0:
            print(f"chapter {ch} failed exit={proc.returncode}", flush=True)
    print(f"done {datetime.now(timezone.utc).isoformat()}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
