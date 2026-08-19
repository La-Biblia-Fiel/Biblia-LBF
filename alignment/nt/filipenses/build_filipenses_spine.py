#!/usr/bin/env python3
"""Build the Filipenses TR token spine from Robinson's parsed Scrivener 1894.

Source of record: source/greek/TR1894/robinson-parsed/PHP.UTR
Accent helper:    source/greek/TR1894/tr1894.txt (verse-level accented Scrivener)
Cross-check:      source/greek/TR1894/scrivener-textonly/PHP.SCV

Writes alignment/nt/filipenses/filipenses-tr-spine.json.
Token ids are persisted as n50CCCVVVTTT and never renumbered.
Read-only with respect to STATUS.md.
"""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
UTR = ROOT / "source/greek/TR1894/robinson-parsed/PHP.UTR"
TR1894 = ROOT / "source/greek/TR1894/tr1894.txt"
OUT = Path(__file__).resolve().parent / "filipenses-tr-spine.json"

BOOK_CODE = 50  # Philippians, protestant NT order used by n{book}{ch}{vs}{tok}

# Robinson .UTR beta code -> unaccented Greek.
BETA = {
    "a": "α", "b": "β", "g": "γ", "d": "δ", "e": "ε", "z": "ζ", "h": "η",
    "q": "θ", "i": "ι", "k": "κ", "l": "λ", "m": "μ", "n": "ν", "x": "ξ",
    "o": "ο", "p": "π", "r": "ρ", "s": "σ", "v": "ς", "t": "τ", "u": "υ",
    "f": "φ", "c": "χ", "y": "ψ", "w": "ω",
}

# The four `|` alternate slots in PHP.UTR, resolved against Scrivener 1894.
# Each maps the verse to the beta form Scrivener actually reads.
# tr1894.txt is a lossy legacy import: it silently drops small words the parsed
# Robinson TR carries (1:6 ὁ, 3:12 ἢ / ᾧ, 4:7 ἡ ... ἡ), and it prints the
# short movable-nu forms (πάσι for πᾶσιν). The parsed TR is the token authority;
# these are the accents supplied for the words tr1894 cannot supply, keyed by
# the beta form and Strong's number so the mapping stays checkable.
SUPPLIED_ACCENTS = {
    ("pasin", "G3956"): "πᾶσιν",
    ("estin", "G1510"): "ἐστίν",
    ("o", "G3588"): "ὁ",
    ("o", "G3739"): "ὃ",
    ("h", "G3588"): "ἡ",
    ("h", "G2228"): "ἢ",
    ("w", "G3739"): "ᾧ",
    ("ekenwsen", "G2758"): "ἐκένωσεν",
    ("uperuywsen", "G5251"): "ὑπερύψωσεν",
    ("hsqenhsen", "G770"): "ἠσθένησεν",
    ("hggisen", "G1448"): "ἤγγισεν",
    ("outwv", "G3779"): "οὕτως",
}

# tr1894.txt also carries a handful of plainly malformed accents. Where the
# word is not in doubt (the beta form and the morph tag agree), the printed
# Scrivener spelling is restored. Keyed by verse and TR token index.
ACCENT_FIXES = {
    ("3", "16", 10): "αὐτὸ",    # tr1894 prints ἀυτο
    ("3", "21", 26): "ἑαυτῷ",   # tr1894 prints ἑαὐτῷ
    ("4", "23", 10): "ὑμῶν",    # tr1894 prints υμῶν, no breathing
    ("4", "23", 11): "ἀμήν",    # tr1894 prints ἀμην, no accent
}

ALTERNATES = {
    ("1", "30"): "eidete",   # tr1894: εἴδετε ; SCV: eidete
    ("4", "2"): "euodian",   # tr1894: Εὐοδίαν ; SCV: euodian
    ("4", "12"): "kai",      # tr1894: οἶδα καὶ ταπεινοῦσθαι ; SCV: oida kai
}


def strip_accents(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", text)
    bare = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return unicodedata.normalize("NFC", bare)


def fold(text: str) -> str:
    """Normalise Greek for comparison: no accents, lowercase, final sigma folded."""
    out = strip_accents(text).lower().replace("ς", "σ")
    return re.sub(r"[^Ͱ-Ͽἀ-῿]", "", out)


def beta_to_greek(word: str) -> str:
    return "".join(BETA.get(ch, ch) for ch in word)


def read_utr() -> dict[tuple[str, str], list[dict]]:
    raw = UTR.read_text(encoding="utf-8", errors="replace").replace("\r\n", "\n")
    # Verse bodies start at a line beginning "ch:vs "; continuation lines are indented.
    chunks: list[tuple[str, str, str]] = []
    current: list[str] = []
    ref: tuple[str, str] | None = None
    for line in raw.split("\n"):
        head = re.match(r"^(\d+):(\d+)\s+(.*)$", line)
        if head:
            if ref is not None:
                chunks.append((ref[0], ref[1], " ".join(current)))
            ref = (head.group(1), head.group(2))
            current = [head.group(3)]
        elif ref is not None and line.strip():
            current.append(line.strip())
    if ref is not None:
        chunks.append((ref[0], ref[1], " ".join(current)))

    verses: dict[tuple[str, str], list[dict]] = {}
    for ch, vs, body in chunks:
        # Drop the editorial subscription: [prov filipphsiouv egrafh ...].
        body = re.sub(r"\[[^\]]*\]", " ", body)
        body = body.replace("|", " ")
        pieces = body.split()

        tokens: list[dict] = []
        pending_word: str | None = None
        pending_numbers: list[str] = []
        alt_pick = ALTERNATES.get((ch, vs))
        dropped_alts: list[str] = []

        def flush(morph: str) -> None:
            nonlocal pending_word, pending_numbers
            if pending_word is None:
                return
            tokens.append(
                {
                    "beta": pending_word,
                    "strongs": "G" + pending_numbers[0] if pending_numbers else "",
                    "robinsonNumbers": pending_numbers,
                    "robinson": morph,
                }
            )
            pending_word = None
            pending_numbers = []

        for piece in pieces:
            if piece.startswith("{") and piece.endswith("}"):
                flush(piece[1:-1])
            elif piece.isdigit():
                pending_numbers.append(piece)
            else:
                word = re.sub(r"[^a-z]", "", piece.lower())
                if not word:
                    continue
                if pending_word is not None:
                    # Two bare words in a row = an unresolved `|` alternate pair.
                    if alt_pick is not None:
                        keep = pending_word if pending_word == alt_pick else word
                        drop = word if keep == pending_word else pending_word
                        dropped_alts.append(drop)
                        pending_word = keep
                        continue
                    raise SystemExit(f"unresolved alternate at {ch}:{vs}: {pending_word}/{word}")
                pending_word = word
        flush("")

        # A fully specified alternate (4:12 `| de ... | kai ... |`) leaves both
        # tokens complete; keep only Scrivener's.
        if alt_pick is not None and not dropped_alts:
            keeping = [t for t in tokens if t["beta"] == alt_pick]
            if keeping:
                seen_other = [t for t in tokens if t["beta"] != alt_pick]
                # Drop only the immediate rival, identified by adjacency.
                for index, token in enumerate(tokens):
                    if token["beta"] == alt_pick and index > 0:
                        rival = tokens[index - 1]
                        if rival["beta"] != alt_pick and rival["robinson"] in {"CONJ"}:
                            dropped_alts.append(rival["beta"])
                            tokens.pop(index - 1)
                        break
                del seen_other
        verses[(ch, vs)] = tokens
        if dropped_alts:
            verses.setdefault("_alts", {})  # type: ignore[arg-type]
    return verses


def read_tr1894() -> dict[tuple[str, str], str]:
    out: dict[tuple[str, str], str] = {}
    for line in TR1894.read_text(encoding="utf-8").splitlines():
        parts = line.split("@")
        if len(parts) < 4 or not parts[2].startswith("PHP."):
            continue
        _, ch, vs = parts[2].split(".")
        out[(ch, vs)] = parts[3].strip()
    return out


def main() -> int:
    utr = {k: v for k, v in read_utr().items() if isinstance(k, tuple)}
    accented = read_tr1894()

    missing = sorted(set(accented) - set(utr)) + sorted(set(utr) - set(accented))
    if missing:
        raise SystemExit(f"verse sets differ: {missing[:5]}")

    verses: dict[str, dict] = {}
    stats = {"verses": 0, "tokens": 0, "accented": 0, "accent_supplied": 0, "accent_corrected": 0, "accent_missing": 0}
    report: list[str] = []

    for ch, vs in sorted(utr, key=lambda k: (int(k[0]), int(k[1]))):
        tokens = utr[(ch, vs)]
        text = accented[(ch, vs)]
        words = [w for w in re.split(r"[\s]+", text) if w]
        cleaned = [re.sub(r"^[^\wͰ-῿]+|[^\wͰ-῿]+$", "", w) for w in words]

        # Walk the accented words in step with the parsed tokens.
        out_tokens = []
        cursor = 0
        for index, token in enumerate(tokens, start=1):
            bare = beta_to_greek(token["beta"])
            greek = bare
            punct = bare
            matched = False
            for probe in range(cursor, min(cursor + 3, len(cleaned))):
                if fold(cleaned[probe]) == fold(bare):
                    greek = cleaned[probe]
                    punct = words[probe]
                    cursor = probe + 1
                    matched = True
                    break
            source_of_accent = "tr1894"
            if matched:
                stats["accented"] += 1
            else:
                supplied = SUPPLIED_ACCENTS.get((token["beta"], token["strongs"]))
                if supplied is not None:
                    greek = supplied
                    punct = supplied
                    source_of_accent = "supplied"
                    stats["accent_supplied"] += 1
                else:
                    source_of_accent = "bare"
                    stats["accent_missing"] += 1
                    report.append(f"{ch}:{vs} token {index} {bare}: no accented match")
            fixed = ACCENT_FIXES.get((ch, vs, index))
            if fixed is not None:
                greek = fixed
                punct = fixed
                source_of_accent = "corrected"
                stats["accent_corrected"] += 1

            out_tokens.append(
                {
                    "sourceTokenId": f"n{BOOK_CODE:02d}{int(ch):03d}{int(vs):03d}{index:03d}",
                    "trIndex": index,
                    "greek": greek,
                    "greekPunct": punct,
                    "beta": token["beta"],
                    "strongs": token["strongs"],
                    "robinson": token["robinson"],
                    "robinsonNumbers": token["robinsonNumbers"],
                    "norm": fold(greek),
                    "accentFrom": source_of_accent,
                }
            )
            stats["tokens"] += 1

        leftover = len(cleaned) - cursor
        if leftover > 0:
            report.append(f"{ch}:{vs}: {leftover} accented word(s) unconsumed: {' '.join(cleaned[cursor:])}")

        verses[f"{ch}:{vs}"] = {
            "ch": int(ch),
            "vs": int(vs),
            "trText": text,
            "tokens": out_tokens,
        }
        stats["verses"] += 1

    spine = {
        "book": "filipenses",
        "bookCode": BOOK_CODE,
        "textualBasis": "Scrivener 1894 TR",
        "morphSource": "Maurice A. Robinson TR (robinson-parsed/PHP.UTR)",
        "accentHelper": "source/greek/TR1894/tr1894.txt (verse-level accented Scrivener 1894)",
        "numbering": "protestant",
        "notes": {
            "alternates": "PHP.UTR carries four `|` slots. Scrivener's readings kept: "
                          "1:30 eidete, 4:2 euodian, 4:12 kai. The editorial subscription "
                          "after 4:23 is not verse text and is excluded.",
            "subscription": "[prov filipphsiouv egrafh apo rwmhv di epafroditou] dropped",
        },
        "stats": stats,
        "verses": verses,
    }
    OUT.write_text(json.dumps(spine, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    print(json.dumps(stats, indent=1))
    for line in report:
        print("  !", line)
    print(f"wrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
