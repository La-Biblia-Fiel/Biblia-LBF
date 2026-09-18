"""Build a source packet for one Protestant verse.

Allowed evidence only: TR1894 (NT) or OSHB/WLC + Paleo/AHRC (OT).
Never includes BLE glosses, RV1909, or existing LBF Spanish.
"""

from __future__ import annotations

import json
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from books import ROOT, Book, get_book
from morph import expand_hebrew_morph
from paleo import ahrc_for, strongs_from_lemma, to_paleo

OSIS_NS = {"o": "http://www.bibletechnologies.net/2003/OSIS/namespace"}
VERSE_LINE = re.compile(r"^(\d+):(\d+)\s+(.*)$")
TOKEN = re.compile(r"([^{}]*)\{([^}]*)\}")

BETA_MAP = {
    "a": "α", "b": "β", "g": "γ", "d": "δ", "e": "ε", "z": "ζ", "h": "η",
    "q": "θ", "i": "ι", "k": "κ", "l": "λ", "m": "μ", "n": "ν", "c": "χ",
    "o": "ο", "p": "π", "r": "ρ", "s": "σ", "v": "ς", "t": "τ", "u": "υ",
    "f": "φ", "x": "ξ", "y": "ψ", "w": "ω",
}


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _kjv_ref_from_note(note_text: str, osis: str) -> tuple[int, int] | None:
    match = re.search(rf"\bKJV:{re.escape(osis)}\.(\d+)\.(\d+)\b", note_text)
    if not match:
        return None
    return int(match.group(1)), int(match.group(2))


def protestant_ref(verse: ET.Element, osis: str, oshb_ch: int, oshb_vs: int) -> tuple[int, int]:
    """Use an explicit KJV note when OSHB supplies one. Never print MT labels."""
    for child in list(verse):
        if local_name(child.tag) != "note":
            continue
        ref = _kjv_ref_from_note("".join(child.itertext()).strip(), osis)
        if ref:
            return ref
    return oshb_ch, oshb_vs


def protestant_segments(
    verse: ET.Element, osis: str, oshb_ch: int, oshb_vs: int
) -> list[tuple[int, int, list[ET.Element]]]:
    """Protestant (ch, vs) spans inside one OSHB verse, with their word nodes.

    OSHB may put several KJV notes in one verse (e.g. Ps 13:6 → KJV 13:5 then 13:6).
    Words after each note belong to that Protestant verse until the next KJV note.
    Words before the first note stay with that note if it names the same chapter
    (Ps 14:1 title+body); if it names another chapter they keep this OSHB label
    (Isa 63:19 before KJV:Isa.64.1). Verses with no KJV note keep OSHB numbering.
    """
    children = list(verse)
    has_kjv = False
    for child in children:
        if local_name(child.tag) != "note":
            continue
        if _kjv_ref_from_note("".join(child.itertext()).strip(), osis):
            has_kjv = True
            break
    if not has_kjv:
        return [(oshb_ch, oshb_vs, direct_words(verse))]

    segments: list[tuple[int, int, list[ET.Element]]] = []
    current: tuple[int, int] | None = None
    words: list[ET.Element] = []
    pending_before: list[ET.Element] = []
    for child in children:
        name = local_name(child.tag)
        if name == "note":
            ref = _kjv_ref_from_note("".join(child.itertext()).strip(), osis)
            if ref is None:
                continue
            if current is not None:
                segments.append((current[0], current[1], words))
                words = []
            current = ref
            # Words before the first KJV note:
            # same chapter → that Protestant verse (Ps 14:1 title+body);
            # other chapter → this OSHB verse's own Protestant label (Isa 63:19
            # before KJV:Isa.64.1).
            if pending_before:
                if ref[0] == oshb_ch:
                    words = pending_before + words
                else:
                    segments.append((oshb_ch, oshb_vs, pending_before))
                pending_before = []
            continue
        if name != "w" or child.get("type") == "x-ketiv":
            continue
        if current is None:
            pending_before.append(child)
            continue
        words.append(child)
    if current is not None:
        segments.append((current[0], current[1], words))
    elif pending_before:
        segments.append((oshb_ch, oshb_vs, pending_before))
    return segments


def direct_words(verse: ET.Element) -> list[ET.Element]:
    words = []
    for child in list(verse):
        if local_name(child.tag) != "w":
            continue
        if child.get("type") == "x-ketiv":
            continue
        words.append(child)
    return words

def surface(word: ET.Element) -> str:
    return "".join(word.itertext()).strip().replace("/", "")


def token_id(book: Book, chapter: int, verse: int, position: int) -> str:
    prefix = "h" if book.testament == "ot" else "n"
    return f"{prefix}{book.book_code:02d}{chapter:03d}{verse:03d}{position:03d}"


def packet_path(book: Book, chapter: int, verse: int) -> Path:
    return (
        ROOT
        / "pipeline"
        / book.testament
        / book.slug
        / f"{book.slug}-{chapter}-{verse}.packet.json"
    )


def ot_chapter_protestant_map(
    book: Book, chapter: int
) -> dict[int, tuple[list[ET.Element], list[str]]]:
    """Map Protestant verse → (word nodes, OSHB OSIS parts) for one chapter.

    Scan the whole OSHB book. A KJV note wins; a verse with no note keeps its
    OSHB chapter.verse as the Protestant label. Psalm titles (OSHB v1, no note)
    therefore merge with the following KJV:Book.N.1 body into Protestant v1.
    Cross-chapter offsets (Eccl 4:17 = Protestant 5:1; Joel 3 = Protestant 2:28)
    are collected when their KJV note names this chapter. Never print MT labels.
    """
    if not book.xml_path.is_file():
        raise FileNotFoundError(f"OSHB XML missing: {book.xml_path}")
    tree = ET.parse(book.xml_path)
    out: dict[int, tuple[list[ET.Element], list[str]]] = {}

    def append_verse(pvs: int, words: list[ET.Element], osis_parts: list[str]) -> None:
        if not words:
            return
        if pvs not in out:
            out[pvs] = ([], [])
        out[pvs][0].extend(words)
        for part in osis_parts:
            if part not in out[pvs][1]:
                out[pvs][1].append(part)

    for element in tree.getroot().iter():
        if local_name(element.tag) != "verse":
            continue
        osis_id = str(element.get("osisID") or "")
        match = re.fullmatch(rf"{re.escape(book.osis)}\.(\d+)\.(\d+)", osis_id)
        if not match:
            continue
        src_ch, src_vs = int(match.group(1)), int(match.group(2))
        osis_part = f"{book.osis}.{src_ch}.{src_vs}"
        for pch, pvs, words in protestant_segments(
            element, book.osis, src_ch, src_vs
        ):
            if pch != chapter:
                continue
            append_verse(pvs, words, [osis_part])
    return out


def build_ot_packet(book: Book, chapter: int, verse: int) -> dict:
    chapter_map = ot_chapter_protestant_map(book, chapter)
    if verse not in chapter_map or not chapter_map[verse][0]:
        raise KeyError(f"{book.slug} {chapter}:{verse} not in {book.xml_path.name}")
    word_nodes, oshb_osis_parts = chapter_map[verse]

    tokens = []
    for position, word in enumerate(word_nodes, start=1):
        lemma = word.get("lemma") or ""
        morph = word.get("morph") or ""
        strongs = strongs_from_lemma(lemma)
        hebrew = surface(word)
        entry = {
            "sourceTokenId": token_id(book, chapter, verse, position),
            "oshbId": word.get("id") or "",
            "position": position,
            "surface": hebrew,
            "paleo": to_paleo(hebrew),
            "lemma": lemma,
            "strongs": strongs,
            "morph": morph,
            "morphExpanded": expand_hebrew_morph(morph),
        }
        evidence = ahrc_for(strongs)
        if evidence:
            entry["ahrc"] = evidence
        tokens.append(entry)

    return {
        "schema": "lbf-source-packet-v1",
        "book": book.slug,
        "label": book.label,
        "testament": "ot",
        "textualBasis": "OSHB/WLC",
        "reference": f"{book.label} {chapter}:{verse}",
        "chapter": chapter,
        "verse": verse,
        "oshbOsis": "+".join(oshb_osis_parts),
        "allowedSources": ["OSHB/WLC", "paleo-hebrew", "AHRC-nonbinding"],
        "forbiddenSources": [
            "memory",
            "theology",
            "RV1909",
            "BLE-gloss",
            "other-versions",
        ],
        "tokens": tokens,
    }

def beta_to_unicode(beta: str) -> str:
    out: list[str] = []
    chars = list((beta or "").lower())
    i = 0
    while i < len(chars):
        ch = chars[i]
        if ch == "*":
            i += 1
            if i < len(chars):
                mapped = BETA_MAP.get(chars[i], chars[i])
                out.append(mapped.upper() if mapped.isalpha() else mapped)
                i += 1
            continue
        if ch == "s":
            nxt = chars[i + 1] if i + 1 < len(chars) else ""
            out.append("ς" if not nxt or nxt not in BETA_MAP else "σ")
            i += 1
            continue
        out.append(BETA_MAP.get(ch, ch))
        i += 1
    return "".join(out)


def parse_utr_verse(path: Path, chapter: int, verse: int) -> list[dict]:
    current = None
    buffer: list[str] = []
    found: list[str] | None = None

    def flush() -> None:
        nonlocal found
        if current == (chapter, verse):
            found = buffer.copy()

    for line in path.read_text(encoding="utf-8").splitlines():
        match = VERSE_LINE.match(line)
        if match:
            flush()
            current = (int(match.group(1)), int(match.group(2)))
            buffer = [match.group(3)]
        elif current is not None and line.strip():
            buffer.append(line.strip())
    flush()
    if found is None:
        raise KeyError(f"{path.name} {chapter}:{verse} not in TR1894")
    body = " ".join(found)
    tokens = []
    position = 0
    for chunk, morph in TOKEN.findall(body):
        words = chunk.replace("|", " ").split()
        strongs: list[str] = []
        surfaces: list[str] = []
        for word in words:
            if word.isdigit():
                strongs.append(word)
            else:
                surfaces.append(word.strip("[]"))
        if not surfaces and not strongs:
            continue
        position += 1
        beta = surfaces[0] if surfaces else ""
        tokens.append(
            {
                "position": position,
                "surfaceBeta": beta,
                "surfaceGreek": beta_to_unicode(beta),
                "surfaceVariants": [beta_to_unicode(item) for item in surfaces[1:]],
                "strongs": f"G{int(strongs[0])}" if strongs else None,
                "morph": morph,
            }
        )
    return tokens


def build_nt_packet(book: Book, chapter: int, verse: int) -> dict:
    if not book.utr_path.is_file():
        raise FileNotFoundError(f"TR1894 UTR missing: {book.utr_path}")
    rows = parse_utr_verse(book.utr_path, chapter, verse)
    tokens = []
    for row in rows:
        tokens.append(
            {
                "sourceTokenId": token_id(book, chapter, verse, row["position"]),
                "position": row["position"],
                "surface": row["surfaceGreek"],
                "surfaceBeta": row["surfaceBeta"],
                "surfaceVariants": row["surfaceVariants"],
                "lemma": None,
                "strongs": row["strongs"],
                "morph": row["morph"],
            }
        )
    return {
        "schema": "lbf-source-packet-v1",
        "book": book.slug,
        "label": book.label,
        "testament": "nt",
        "textualBasis": "TR1894",
        "reference": f"{book.label} {chapter}:{verse}",
        "chapter": chapter,
        "verse": verse,
        "allowedSources": ["TR1894"],
        "forbiddenSources": [
            "memory",
            "theology",
            "RV1909",
            "BLE-gloss",
            "critical-text",
            "other-versions",
        ],
        "tokens": tokens,
    }


def list_ot_verses(book: Book, chapter: int) -> list[int]:
    chapter_map = ot_chapter_protestant_map(book, chapter)
    verses = sorted(v for v, (words, _) in chapter_map.items() if words)
    if not verses:
        raise KeyError(f"{book.slug} chapter {chapter} not in {book.xml_path.name}")
    return verses

def list_nt_verses(book: Book, chapter: int) -> list[int]:
    if not book.utr_path.is_file():
        raise FileNotFoundError(f"TR1894 UTR missing: {book.utr_path}")
    verses: list[int] = []
    seen: set[int] = set()
    for line in book.utr_path.read_text(encoding="utf-8").splitlines():
        match = VERSE_LINE.match(line)
        if not match:
            continue
        ch, vs = int(match.group(1)), int(match.group(2))
        if ch == chapter and vs not in seen:
            seen.add(vs)
            verses.append(vs)
    if not verses:
        raise KeyError(f"{book.slug} chapter {chapter} not in {book.utr_path.name}")
    return verses


def list_verses(slug: str, chapter: int) -> list[int]:
    """Protestant verse numbers in one chapter. Never MT labels."""
    book = get_book(slug)
    if book.testament == "ot":
        return list_ot_verses(book, chapter)
    return list_nt_verses(book, chapter)


def build_packet(slug: str, chapter: int, verse: int) -> dict:
    book = get_book(slug)
    if book.testament == "ot":
        return build_ot_packet(book, chapter, verse)
    return build_nt_packet(book, chapter, verse)


def packet_for_prompt(packet: dict) -> dict:
    """Drop non-binding AHRC from the live model prompt. Disk packets stay full."""
    out = dict(packet)
    out["tokens"] = [
        {key: value for key, value in token.items() if key != "ahrc"}
        for token in packet.get("tokens") or []
    ]
    return out


def dump_prompt(payload: dict) -> str:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def write_packet(packet: dict) -> Path:
    book = get_book(packet["book"])
    path = packet_path(book, packet["chapter"], packet["verse"])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(packet, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path
