#!/usr/bin/env python3
"""Run one chapter. Default is Cursor Auto; Sonnet only if a verse is questionable.

Never writes translation/*.md or STATUS.md. Re-run after Cursor writes reply JSON.

    python3 tools/pipeline/run_chapter.py exodo 1
    python3 tools/pipeline/run_chapter.py exodo 1 --from 1 --to 5
    python3 tools/pipeline/run_chapter.py exodo 1 --api
    python3 tools/pipeline/run_chapter.py exodo 1 --full
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import env_load  # noqa: F401
from runner import run_chapter


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("book")
    parser.add_argument("chapter", type=int)
    parser.add_argument("--from", dest="start", type=int, default=1)
    parser.add_argument("--to", dest="end", type=int, default=None)
    parser.add_argument(
        "--no-resume",
        action="store_true",
        help="Re-run passed and parked verses instead of skipping them",
    )
    parser.add_argument(
        "--full",
        action="store_true",
        help="Ask Sonnet for every verse. Default asks Sonnet only when a verse is questionable.",
    )
    parser.add_argument(
        "--api",
        action="store_true",
        help="Paid path: GPT drafts, Grok audits, Sonnet only if Grok warns. Default is Cursor Auto.",
    )
    args = parser.parse_args()

    def progress(result: dict) -> None:
        verse = result.get("verse")
        status = result.get("status")
        extra = result.get("reason") or result.get("stage") or result.get("error") or ""
        print(f"{verse}: {status} {extra}".strip(), flush=True)

    queue = run_chapter(
        args.book,
        args.chapter,
        start=args.start,
        end=args.end,
        resume=not args.no_resume,
        polish="always" if args.full else "warn",
        engine="api" if args.api else "cursor",
        on_progress=progress,
    )
    usage = queue.get("usage") or {}
    print(
        json.dumps(
            {
                "engine": queue.get("engine"),
                "passed": queue.get("passed"),
                "holds": [item.get("verse") for item in queue.get("holds") or []],
                "waiting": [
                    {
                        "verse": item.get("verse"),
                        "stage": item.get("stage"),
                        "model": item.get("model"),
                    }
                    for item in queue.get("waiting") or []
                ],
                "errors": queue.get("errors"),
                "usd": usage.get("usd"),
                "usdPerVerse": usage.get("usdPerVerse"),
                "bibleAtThisRate": usage.get("bibleAtThisRate"),
                "calls": usage.get("calls"),
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
