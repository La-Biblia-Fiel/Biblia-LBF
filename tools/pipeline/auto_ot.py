#!/usr/bin/env python3
"""Run OT machine passes sequentially, leaving all approval to a person.

    python3 tools/pipeline/auto_ot.py --from-book exodo --from-chapter 21
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from books import OT, ROOT, Book
from run_book import chapter_count


def selected_books(first: str, last: str | None) -> list[Book]:
    slugs = [book.slug for book in OT]
    if first not in slugs:
        raise ValueError(f"{first!r} is not an Old Testament book")
    if last is not None and last not in slugs:
        raise ValueError(f"{last!r} is not an Old Testament book")
    start = slugs.index(first)
    end = slugs.index(last) + 1 if last else len(slugs)
    if end <= start:
        raise ValueError("--to-book must not come before --from-book")
    return OT[start:end]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from-book", default="genesis")
    parser.add_argument("--from-chapter", type=int, default=1)
    parser.add_argument("--to-book")
    parser.add_argument(
        "--workers",
        type=int,
        default=6,
        help="Concurrent verses per chapter (default: 6)",
    )
    parser.add_argument(
        "--retry-rounds",
        type=int,
        default=2,
        help="Retry incomplete chapters after the first OT pass (default: 2)",
    )
    args = parser.parse_args(argv)

    try:
        books = selected_books(args.from_book, args.to_book)
    except ValueError as exc:
        parser.error(str(exc))

    first_last = chapter_count(books[0].slug)
    if not 1 <= args.from_chapter <= first_last:
        parser.error(
            f"--from-chapter must be between 1 and {first_last} for {books[0].slug}"
        )
    if args.workers < 1:
        parser.error("--workers must be at least 1")
    if args.retry_rounds < 0:
        parser.error("--retry-rounds must not be negative")

    print(
        "Run git pull --ff-only once before this command if the working tree permits it.\n"
        "This runner will not pull, commit, approve, align, or publish anything.",
        flush=True,
    )

    def run_chapter(book: Book, chapter: int) -> int:
        print(f"\n=== {book.label} {chapter} ===", flush=True)
        proc = subprocess.run(
            [
                sys.executable,
                str(ROOT / "tools/pipeline/auto_pass.py"),
                book.slug,
                str(chapter),
                "--workers",
                str(args.workers),
            ],
            cwd=ROOT,
        )
        return proc.returncode

    incomplete: list[tuple[Book, int]] = []
    for book_index, book in enumerate(books):
        start = args.from_chapter if book_index == 0 else 1
        for chapter in range(start, chapter_count(book.slug) + 1):
            exit_code = run_chapter(book, chapter)
            if exit_code != 0:
                print(
                    f"Queued for retry: {book.slug} {chapter} exited with {exit_code}.",
                    file=sys.stderr,
                )
                incomplete.append((book, chapter))

    for retry_round in range(1, args.retry_rounds + 1):
        if not incomplete:
            break
        print(
            f"\n=== retry round {retry_round}: {len(incomplete)} incomplete chapter(s) ===",
            flush=True,
        )
        remaining = []
        for book, chapter in incomplete:
            if run_chapter(book, chapter) != 0:
                remaining.append((book, chapter))
        incomplete = remaining

    if incomplete:
        refs = ", ".join(f"{book.slug} {chapter}" for book, chapter in incomplete)
        print(
            f"Machine pass ended with unresolved chapters after retries: {refs}",
            file=sys.stderr,
        )
        return 1

    print(
        "Old Testament machine pass complete with no unresolved chapter errors. "
        "Review the chapters and reports; "
        "no approval state was changed.",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
