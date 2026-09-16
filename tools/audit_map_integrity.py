#!/usr/bin/env python3
"""Audit map integrity for one book's reverse-links. Optional accept.

This is the finish path for an owner who does not read Hebrew/Greek.

It does **not** certify that each Hebrew/Greek link is lexically correct.
It certifies structural map integrity a Spanish owner can own:

  - every phrase has units with source tokens
  - unit surfaces reconstruct the Spanish (same rule as status.py)
  - linked token IDs exist on the phrase/spine and cover the phrase
  - no auto-zip / gloss methods
  - unfinished statuses are only seeds / in-progress / mapped / hand / …

Usage:

    python3 tools/audit_map_integrity.py zacarias
    python3 tools/audit_map_integrity.py zacarias --accept-maps

`--accept-maps` writes `status: mapped` only on phrases that pass with zero
structural findings. It never touches auto/gloss/unwalked phrases. It is not
a silent bulk flip: you must pass `--accept-maps` and type the book slug.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import status as lbf

ROOT = lbf.ROOT
FINISHED = lbf.FINISHED_LINK_STATUSES
AUTO = lbf.AUTO_METHODS
GLOSS = lbf.GLOSS_METHODS
HAND_METHODS = lbf.HAND_METHODS
SEED_OR_OPEN = {
    "seeded-hand",
    "seeded-auto",
    "seeded-ai",
    "seeded-ai-invalid",
    "seeded-ai-error",
    "in-progress",
    "gloss-seed",
    "",
}


def norm_lex(text: str) -> str:
    return re.sub(r"[^\w]+", "", text or "", flags=re.UNICODE).casefold()


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def phrase_path(book: str, testament: str) -> Path:
    return ROOT / "alignment" / testament / book / f"{book}-phrases.json"


def spine_path(book: str, testament: str) -> Path | None:
    base = ROOT / "alignment" / testament / book
    for name in (f"{book}-oshb-spine.json", f"{book}-tr-spine.json"):
        candidate = base / name
        if candidate.is_file():
            return candidate
    return None


def token_index_from_phrases(phrases: list[dict]) -> dict[str, str]:
    """sourceTokenId -> chapter:verse from phrase file."""
    index: dict[str, str] = {}
    for phrase in phrases:
        ch = phrase.get("chapter")
        vs = phrase.get("verse")
        cv = f"{ch}:{vs}" if ch is not None and vs is not None else ""
        if not cv:
            match = re.search(r"(\d+):(\d+)\s*$", str(phrase.get("reference") or ""))
            cv = f"{match.group(1)}:{match.group(2)}" if match else ""
        for token_id in phrase.get("sourceTokenIds") or []:
            index[str(token_id)] = cv
        for row in phrase.get("tokenRows") or []:
            tid = str(row.get("sourceTokenId") or "")
            if tid:
                index[tid] = cv
    return index


def audit_phrase(link: dict, phrase: dict | None, token_verse: dict[str, str]) -> list[str]:
    findings: list[str] = []
    idx = link.get("phraseIndex")
    status = str(link.get("status") or "")
    units = link.get("units") or []
    methods = [str(u.get("method") or "") for u in units]

    if not units or status == "unwalked":
        findings.append("unwalked / empty units")
        return findings
    if any(m in AUTO for m in methods):
        findings.append(f"auto method ({', '.join(sorted({m for m in methods if m in AUTO}))})")
    if any(m in GLOSS for m in methods):
        findings.append(f"gloss method ({', '.join(sorted({m for m in methods if m in GLOSS}))})")
    if any(m and m not in HAND_METHODS for m in methods):
        bad = sorted({m for m in methods if m and m not in HAND_METHODS})
        if bad:
            findings.append(f"non-hand unit method ({', '.join(bad)})")

    for unit in units:
        if not unit.get("sourceTokenIds"):
            findings.append(f"unit {unit.get('unitId') or '?'} has no source tokens")

    phrase_ids = {str(t) for t in (phrase or {}).get("sourceTokenIds") or []}
    unit_ids: set[str] = set()
    for unit in units:
        unit_ids.update(str(t) for t in (unit.get("sourceTokenIds") or []))

    if phrase_ids:
        missing = sorted(phrase_ids - unit_ids)
        extra = sorted(unit_ids - phrase_ids)
        if missing:
            findings.append(f"uncovered phrase tokens: {', '.join(missing[:6])}")
        if extra:
            findings.append(f"tokens outside phrase span: {', '.join(extra[:6])}")

    match = re.search(r"(\d+):(\d+)\s*$", str(link.get("reference") or ""))
    cv = f"{match.group(1)}:{match.group(2)}" if match else ""
    for tid in unit_ids:
        if tid not in token_verse:
            findings.append(f"unknown token {tid}")
        elif cv and token_verse[tid] != cv:
            findings.append(f"token {tid} belongs to {token_verse[tid]}, not {cv}")

    if phrase is not None:
        reconstructed = "".join(str(u.get("surface") or "") for u in units)
        if norm_lex(reconstructed) != norm_lex(str(phrase.get("spanish") or "")):
            findings.append("units do not reconstruct phrase Spanish")

    if status in {"seeded-auto", "seeded-ai-invalid", "seeded-ai-error"} and not findings:
        findings.append(f"status {status} is not acceptable for map accept")

    return findings


def audit_book(book: str, testament: str) -> dict:
    align = lbf.alignment_path(book, testament)
    phrases_file = phrase_path(book, testament)
    if not align.is_file():
        raise SystemExit(f"{book}: missing {align}")
    doc = load_json(align)
    links = doc.get("links") or []
    phrases = load_json(phrases_file) if phrases_file.is_file() else []
    if isinstance(phrases, dict):
        phrases = phrases.get("phrases") or phrases.get("items") or []
    by_index = {
        int(p["phraseIndex"]): p
        for p in phrases
        if isinstance(p, dict) and "phraseIndex" in p
    }
    token_verse = token_index_from_phrases(phrases)

    rows = []
    for link in links:
        idx = int(link.get("phraseIndex"))
        phrase = by_index.get(idx)
        findings = audit_phrase(link, phrase, token_verse)
        status = str(link.get("status") or "")
        if status in FINISHED and not findings:
            grade = "done"
        elif not findings:
            grade = "green"
        else:
            grade = "red"
        rows.append(
            {
                "phraseIndex": idx,
                "reference": link.get("reference"),
                "status": status,
                "grade": grade,
                "findings": findings,
            }
        )
    return {"doc": doc, "path": align, "rows": rows}


def print_report(book: str, rows: list[dict]) -> Counter:
    counts = Counter(row["grade"] for row in rows)
    print(f"{book}: phrases={len(rows)} green={counts['green']} red={counts['red']} already-done={counts['done']}")
    reds = [row for row in rows if row["grade"] == "red"]
    if reds:
        print("\nRed phrases (must fix before accept):")
        for row in reds[:40]:
            print(f"  [{row['phraseIndex']}] {row['reference']} ({row['status']})")
            for finding in row["findings"]:
                print(f"      - {finding}")
        if len(reds) > 40:
            print(f"  … {len(reds) - 40} more")
    else:
        print("\nNo structural reds. Map integrity is ready for book-level accept.")
    return counts


def accept_maps(book: str, doc: dict, path: Path, rows: list[dict]) -> int:
    by_index = {row["phraseIndex"]: row for row in rows}
    changed = 0
    for link in doc.get("links") or []:
        idx = int(link.get("phraseIndex"))
        row = by_index.get(idx)
        if not row or row["grade"] != "green":
            continue
        status = str(link.get("status") or "")
        if status in FINISHED:
            continue
        if status not in SEED_OR_OPEN and status not in {"seeded-hand"}:
            # Only promote known unfinished seed / open statuses.
            if status not in {"seeded-hand", "in-progress", "seeded-ai", "gloss-seed", ""}:
                continue
        for unit in link.get("units") or []:
            unit["method"] = "hand"
            unit["status"] = "map-accepted"
        link["status"] = "mapped"
        changed += 1
    if changed:
        doc["stats"] = {
            **(doc.get("stats") or {}),
            "mapAcceptedBy": "audit_map_integrity.py --accept-maps",
            "mapAcceptedBook": book,
        }
        # Refresh method counts lightly.
        path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return changed


def testament_for(book: str) -> str:
    rows = lbf.parse_status_table(lbf.STATUS_PATH.read_text(encoding="utf-8"))
    for row in rows:
        if row["book"] == book:
            return row["testament"]
    raise SystemExit(f"{book}: not in STATUS.md")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("book", help="Book slug, e.g. zacarias")
    parser.add_argument(
        "--accept-maps",
        action="store_true",
        help="Write status=mapped for every structurally green unfinished phrase",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Skip interactive slug confirmation (still requires --accept-maps)",
    )
    args = parser.parse_args()
    book = args.book.strip().lower()
    testament = testament_for(book)
    result = audit_book(book, testament)
    counts = print_report(book, result["rows"])

    if not args.accept_maps:
        print(
            "\nNext: fix reds in Translator if any, then:\n"
            f"  python3 tools/audit_map_integrity.py {book} --accept-maps\n"
            "That is map integrity acceptance for a non-Hebraist/Hellenist owner.\n"
            "It does not claim source-language review."
        )
        return 1 if counts["red"] else 0

    if counts["red"]:
        print("\nRefusing --accept-maps while red phrases remain.", file=sys.stderr)
        return 2
    if counts["green"] == 0:
        print("\nNothing to accept (no green unfinished phrases).")
        return 0

    if not args.yes:
        typed = input(f"Type '{book}' to accept {counts['green']} green map(s): ").strip()
        if typed != book:
            print("Aborted.", file=sys.stderr)
            return 3

    changed = accept_maps(book, result["doc"], result["path"], result["rows"])
    print(f"\nWrote mapped on {changed} phrase(s) in {result['path']}")
    print("Run: python3 tools/verify.py " + book)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
