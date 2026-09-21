#!/usr/bin/env python3
"""Remap Hebraized proper names → conventional Spanish (PROPER_NAMES.md).

Does not call APIs. Does not write STATUS.md (caller demotes).
Does not touch alignment JSON.

    python3 tools/remap_proper_names.py --dry-run genesis exodo
    python3 tools/remap_proper_names.py --books genesis-isaias
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OT = ROOT / "translation" / "ot"

# Genesis through Isaiah (Protestant order used in this repo).
GENESIS_TO_ISAIAH = [
    "genesis",
    "exodo",
    "levitico",
    "numeros",
    "deuteronomio",
    "josue",
    "jueces",
    "rut",
    "1samuel",
    "2samuel",
    "1reyes",
    "2reyes",
    "1cronicas",
    "2cronicas",
    "esdras",
    "nehemias",
    "ester",
    "job",
    "salmos",
    "proverbios",
    "eclesiastes",
    "cantares",
    "isaias",
]

# Hebraized / scholar → conventional. Longer keys first at apply time.
# Ethnonym phrases listed separately below.
NAME_MAP: list[tuple[str, str]] = [
    # persons
    ("Yeshayahu", "Isaías"),
    ("Jizqiyahu", "Ezequías"),
    ("Uzziyahu", "Uzías"),
    ("Jilqiyahu", "Hilcías"),
    ("Elyaqim", "Eliaquim"),
    ("Shelomó", "Salomón"),
    ("Shelomo", "Salomón"),
    ("Yehoshafat", "Josafat"),
    ("Yehoshua", "Josué"),
    ("Yehonatán", "Jonatán"),
    ("Yehoash", "Joás"),
    ("Yehoyaqim", "Joacim"),
    ("Yehoyaquin", "Joaquín"),
    ("Yehoyakín", "Joaquín"),
    ("Tsidqiyahu", "Sedequías"),
    ("Tsidqiyáhu", "Sedequías"),
    ("Mikayahu", "Micaías"),
    ("Gedalyáhu", "Gedalías"),
    ("Yirmeyahu", "Jeremías"),
    ("Yechezqel", "Ezequiel"),
    ("Yechezquel", "Ezequiel"),
    ("Hoshea", "Oseas"),
    ("Binyamín", "Benjamín"),
    ("Binyamin", "Benjamín"),
    ("Menashé", "Manasés"),
    ("Menashéh", "Manasés"),
    ("Efráyim", "Efraín"),
    ("Efrayim", "Efraín"),
    ("Yisasjar", "Isacar"),
    ("Zevulún", "Zabulón"),
    ("Naftalí", "Neftalí"),
    ("Yismael", "Ismael"),
    ("Yitsjaq", "Isaac"),
    ("Yaakov", "Jacob"),
    ("Yosef", "José"),
    ("Yehudá", "Judá"),
    ("Yehuda", "Judá"),
    ("Reuvén", "Rubén"),
    ("Shimón", "Simeón"),
    ("Shimon", "Simeón"),
    ("Ribqá", "Rebeca"),
    ("Rajel", "Raquel"),
    ("Leá", "Lea"),
    ("Esav", "Esaú"),
    ("Havá", "Eva"),
    ("Hével", "Abel"),
    ("Noaj", "Noé"),
    ("Hagar", "Agar"),
    ("Sarái", "Sarai"),
    ("Najor", "Nacor"),
    ("Milcá", "Milca"),
    ("Abimélek", "Abimelec"),
    ("Abimelek", "Abimelec"),
    ("Amots", "Amoz"),
    ("Yotam", "Jotam"),
    ("Ajaz", "Acaz"),
    ("Ajab", "Acab"),
    ("Shevná", "Sebna"),
    ("Iyov", "Job"),
    ("Mosheh", "Moisés"),
    ("Moshe", "Moisés"),
    ("Aharon", "Aarón"),
    ("Qohélet", "Cohélet"),
    ("Lemuél", "Lemuel"),
    ("Yaké", "Jaqué"),
    ("Asher", "Aser"),
    # places / peoples (single-token)
    ("Yerushaláyim", "Jerusalén"),
    ("Yerushalayim", "Jerusalén"),
    ("Mitsráyim", "Egipto"),
    ("Mizraim", "Egipto"),
    ("Levanón", "Líbano"),
    ("Levanon", "Líbano"),
    ("Tsiyón", "Sión"),
    ("Tsiyon", "Sión"),
    ("Dameseq", "Damasco"),
    ("Beer Sheva", "Beerseba"),
    ("Beer-Sheva", "Beerseba"),
    ("Ein Guedí", "Engadi"),
    ("Ein-Guedí", "Engadi"),
    ("Gilad", "Galaad"),
    ("Sharón", "Sarón"),
    ("Sharon", "Sarón"),
    ("Jermón", "Hermón"),
    ("Hermon", "Hermón"),
    ("Moriyá", "Moria"),
    ("Macpelá", "Macpela"),
    ("Mamré", "Mamre"),
    ("Sedom", "Sodoma"),
    ("Néguev", "Neguev"),
    ("Bavel", "Babilonia"),
    ("Ashur", "Asiria"),
    ("Tsor", "Tiro"),
    ("Tsidón", "Sidón"),
    ("Tsidon", "Sidón"),
    ("Tarshish", "Tarsis"),
    ("Tsoán", "Zoán"),
    ("Shihor", "Sihor"),
    ("Qedar", "Cedar"),
    ("Teimá", "Tema"),
    ("Dumá", "Duma"),
    ("Arav", "Arabia"),
    ("Madai", "Media"),
    ("Kasdim", "caldeos"),
    ("Kittim", "Quitim"),
    ("Pelishtim", "filisteos"),
    ("Refaím", "Refaim"),
    ("Raamsés", "Raamses"),
    ("Molek", "Moloc"),
    ("Yawan", "Javán"),
    ("Yawán", "Javán"),
    ("Yaván", "Javán"),
    ("Shomrón", "Samaria"),
    ("Shomron", "Samaria"),
    ("Shaúl", "Saúl"),
    ("Shaul", "Saúl"),
]

# Phrase-level ethnonym / construct fixes (applied before single-token map).
PHRASE_MAP: list[tuple[str, str]] = [
    (r"\blos\s+Mizraim\b", "los egipcios"),
    (r"\blos\s+mizraim\b", "los egipcios"),
    (r"\bdel\s+Mizraim\b", "de Egipto"),
    (r"\bde\s+Mizraim\b", "de Egipto"),
    (r"\ben\s+Mizraim\b", "en Egipto"),
    (r"\ba\s+Mizraim\b", "a Egipto"),
    (r"\bhacia\s+Mizraim\b", "hacia Egipto"),
    (r"\bdesde\s+Mizraim\b", "desde Egipto"),
    (r"\blos\s+Pelishtim\b", "los filisteos"),
    (r"\blos\s+pelishtim\b", "los filisteos"),
    (r"\blos\s+Kasdim\b", "los caldeos"),
    (r"\blos\s+kasdim\b", "los caldeos"),
]


def apply_names(text: str) -> tuple[str, dict[str, int]]:
    counts: dict[str, int] = {}
    out = text
    for pattern, repl in PHRASE_MAP:
        out, n = re.subn(pattern, repl, out)
        if n:
            counts[f"phrase:{pattern}"] = counts.get(f"phrase:{pattern}", 0) + n
    # Longest Hebraized forms first.
    for old, new in sorted(NAME_MAP, key=lambda kv: len(kv[0]), reverse=True):
        pattern = re.compile(rf"(?<!\w){re.escape(old)}(?!\w)")
        out, n = pattern.subn(new, out)
        if n:
            counts[old] = counts.get(old, 0) + n
        # lowercase mid-sentence variants when the Hebraized form was capitalized only
        low = old[0].lower() + old[1:] if old else old
        if low != old:
            pattern_l = re.compile(rf"(?<!\w){re.escape(low)}(?!\w)")
            out, n = pattern_l.subn(new[0].lower() + new[1:] if new else new, out)
            if n:
                counts[low] = counts.get(low, 0) + n
    return out, counts


def resolve_books(spec: list[str]) -> list[str]:
    if not spec or spec == ["genesis-isaias"]:
        return list(GENESIS_TO_ISAIAH)
    out: list[str] = []
    for item in spec:
        if item == "genesis-isaias":
            out.extend(GENESIS_TO_ISAIAH)
        else:
            out.append(item)
    # unique preserve order
    seen: set[str] = set()
    ordered: list[str] = []
    for b in out:
        if b not in seen:
            seen.add(b)
            ordered.append(b)
    return ordered


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("books", nargs="*", default=["genesis-isaias"])
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    books = resolve_books(args.books)
    grand: dict[str, int] = {}
    changed_books: list[str] = []
    for slug in books:
        path = OT / f"{slug}.md"
        if not path.is_file():
            print(f"skip missing {path}", file=sys.stderr)
            continue
        original = path.read_text(encoding="utf-8")
        updated, counts = apply_names(original)
        total = sum(counts.values())
        if total == 0:
            print(f"{slug}: 0 replacements")
            continue
        changed_books.append(slug)
        for k, v in sorted(counts.items(), key=lambda kv: -kv[1]):
            grand[k] = grand.get(k, 0) + v
        print(f"{slug}: {total} replacements ({', '.join(f'{k}×{v}' for k,v in sorted(counts.items(), key=lambda kv:-kv[1])[:8])}…)")
        if not args.dry_run:
            path.write_text(updated, encoding="utf-8")
    print(
        f"{'would change' if args.dry_run else 'changed'} books: {', '.join(changed_books) or '(none)'}"
    )
    print(f"total replacements: {sum(grand.values())}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
