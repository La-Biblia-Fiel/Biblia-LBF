#!/usr/bin/env python3
"""Move complete work from `draft` to `ready`. Never writes `done`."""

from __future__ import annotations

import argparse
import sys

import status as lbf

ROOT = lbf.ROOT
STATUS_PATH = lbf.STATUS_PATH


def decided_state(current: str, file_exists: bool, errors: list[str]) -> str:
    if current == "done":
        return "done"
    if not file_exists:
        return "none"
    if errors:
        return "draft"
    return "ready"


def format_row(row: dict[str, str]) -> str:
    return (
        f"| {row['book']} | {row['testament']} | {row['translation']} | {row['alignment']} | "
        f"{row['translation_by']} | {row['translation_on']} | {row['alignment_by']} | "
        f"{row['alignment_on']} | {row['notes']} |"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("book", nargs="?", help="One book slug. Default: every book.")
    args = parser.parse_args()

    text = STATUS_PATH.read_text(encoding="utf-8")
    rows = lbf.parse_status_table(text)
    if not rows:
        print("STATUS.md has no book rows", file=sys.stderr)
        return 2
    if args.book and args.book not in {row["book"] for row in rows}:
        print(f"{args.book} is not in STATUS.md", file=sys.stderr)
        return 2

    changed = 0
    by_book = {row["book"]: row for row in rows}
    for row in rows:
        if args.book and row["book"] != args.book:
            continue
        book = row["book"]
        testament = row["testament"]
        expected = lbf.EXPECTED_VERSES.get(book)
        t_path = lbf.translation_path(book, testament)
        a_path = lbf.alignment_path(book, testament)
        t_errors = lbf.translation_errors(book, testament, expected) if t_path.is_file() else ["missing"]
        a_errors = lbf.alignment_errors(book, testament, expected) if a_path.is_file() else ["missing"]

        new_tr = decided_state(row["translation"], t_path.is_file(), t_errors if t_path.is_file() else ["missing"])
        new_al = decided_state(row["alignment"], a_path.is_file(), a_errors if a_path.is_file() else ["missing"])

        def report(kind: str, before: str, after: str, errors: list[str]) -> None:
            if before == "done":
                extra = " unsigned" if (
                    (kind == "translation" and (not row["translation_by"] or not row["translation_on"]))
                    or (kind == "alignment" and (not row["alignment_by"] or not row["alignment_on"]))
                ) else ""
                print(f"{book:<16} {kind:<12} {before}{extra}")
                if errors and before == "done":
                    for item in errors:
                        print(f"  ! {item}")
                return
            if before == after:
                why = ""
                if after == "draft" and errors:
                    why = f"  {errors[0]}"
                print(f"{book:<16} {kind:<12} {before}{why}")
                return
            print(f"{book:<16} {kind:<12} {before} → {after}")
            if after == "draft":
                for item in errors[:4]:
                    print(f"  - {item}")

        report("translation", row["translation"], new_tr, t_errors if t_path.is_file() else [])
        report("alignment", row["alignment"], new_al, a_errors if a_path.is_file() else [])

        if new_tr != row["translation"] or new_al != row["alignment"]:
            row["translation"] = new_tr
            row["alignment"] = new_al
            by_book[book] = row
            changed += 1

    if changed:
        out_lines = []
        for line in text.splitlines():
            if line.startswith("| "):
                cells = [cell.strip() for cell in line.strip("|").split("|")]
                book = cells[0] if cells else ""
                if book in by_book and book not in {"book", "---"} and not book.startswith("-"):
                    out_lines.append(format_row(by_book[book]))
                    continue
            out_lines.append(line)
        STATUS_PATH.write_text("\n".join(out_lines) + "\n", encoding="utf-8")

    print()
    print(f"updated {changed} row(s). `ready` awaits your approval. This script never writes `done`.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
