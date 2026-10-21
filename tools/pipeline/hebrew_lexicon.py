"""Pinned, fail-closed access to the Open Scriptures Hebrew Lexicon.

This module is the only automatic Hebrew lexicon loader for LBF. It maps the
augmented Strong identifier carried by OSHB to the Open Scriptures lexical
index and its BDB entry. Lexical data documents possibilities; it never picks
the contextual sense.
"""

from __future__ import annotations

import hashlib
import re
import xml.etree.ElementTree as ET
from functools import lru_cache
from pathlib import Path

from books import ROOT


LEXICON_DIR = ROOT / "Lexicons" / "HebrewLexicon-master"
UPSTREAM = "https://github.com/openscriptures/HebrewLexicon"
UPSTREAM_COMMIT = "21c9add13bc727d3a951361778e97e3ff7afd1ce"
LICENSE = "CC BY 4.0"
ATTRIBUTION = "Open Scriptures Hebrew Bible Project"
NS = {"o": "http://openscriptures.github.com/morphhb/namespace"}

PINNED_SHA256 = {
    "AugIndex.xml": "e7217ca8ff8ff3f21f9cf1bbe87411adf55f6aa88bcf5ed9ddc886cc6b160c5d",
    "BrownDriverBriggs.xml": "2b52658a4323d91674cda4090ab8b3ebddfff640f4f18143c28300e80b2c38f8",
    "LexicalIndex.xml": "8f7a605c58899d2f44430149c143c00903976e1e91232476677972a69e5bc85f",
    "HebrewStrong.xml": "a628f4f89f8bdaf2483fd3faf1abc8653cc6717758dfc9f24beb7571d9bdd0c4",
    "readme.md": "9a129c25674387c494571c3828aa3a8eb78459c165e275c313ae26994ce8ff22",
}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


@lru_cache(maxsize=1)
def verify_pinned_files() -> None:
    """Refuse missing or changed lexical sources."""
    for name, expected in PINNED_SHA256.items():
        path = LEXICON_DIR / name
        if not path.is_file():
            raise FileNotFoundError(f"pinned Hebrew lexicon file missing: {path}")
        actual = _sha256(path)
        if actual != expected:
            raise ValueError(
                f"pinned Hebrew lexicon checksum mismatch: {name}: {actual}"
            )


def augmented_strong(oshb_lemma: str) -> str | None:
    """Return OSHB's augmented Strong key, stripping only morphology prefixes."""
    final = (oshb_lemma or "").split("/")[-1].strip().lower()
    match = re.fullmatch(r"(\d+)\s*([a-z]?)", final)
    if not match:
        return None
    return f"{int(match.group(1))}{match.group(2)}"


def _text(element: ET.Element | None) -> str | None:
    if element is None:
        return None
    value = " ".join("".join(element.itertext()).split())
    return value or None


def _unique(values: list[str]) -> list[str]:
    return list(dict.fromkeys(value for value in values if value))


@lru_cache(maxsize=1)
def _indexes() -> tuple[dict[str, str], dict[str, ET.Element], dict[str, ET.Element]]:
    verify_pinned_files()
    aug_root = ET.parse(LEXICON_DIR / "AugIndex.xml").getroot()
    lexical_root = ET.parse(LEXICON_DIR / "LexicalIndex.xml").getroot()
    bdb_root = ET.parse(LEXICON_DIR / "BrownDriverBriggs.xml").getroot()

    augmented = {
        str(node.get("aug")): (_text(node) or "")
        for node in aug_root.findall(".//o:w", NS)
        if node.get("aug") and _text(node)
    }
    lexical = {
        str(node.get("id")): node
        for node in lexical_root.findall(".//o:entry", NS)
        if node.get("id")
    }
    bdb = {
        str(node.get("id")): node
        for node in bdb_root.findall(".//o:entry", NS)
        if node.get("id")
    }
    return augmented, lexical, bdb


def lookup(oshb_lemma: str) -> dict | None:
    """Return compact lexical possibilities for one OSHB lemma."""
    key = augmented_strong(oshb_lemma)
    if key is None:
        return None
    augmented, lexical_entries, bdb_entries = _indexes()
    lexical_id = augmented.get(key)
    lexical = lexical_entries.get(lexical_id or "")
    if lexical is None:
        return None

    word = lexical.find("o:w", NS)
    xref = lexical.find("o:xref", NS)
    bdb_id = xref.get("bdb") if xref is not None else None
    bdb = bdb_entries.get(bdb_id or "")
    definitions = []
    references = []
    if bdb is not None:
        definitions = _unique(
            [_text(node) or "" for node in bdb.findall(".//o:def", NS)]
        )
        references = _unique(
            [str(node.get("r")) for node in bdb.findall(".//o:ref", NS) if node.get("r")]
        )

    return {
        "source": "OpenScriptures-HebrewLexicon",
        "sourceCommit": UPSTREAM_COMMIT,
        "license": LICENSE,
        "attribution": ATTRIBUTION,
        "augmentedStrong": key,
        "lexicalIndexId": lexical_id,
        "headword": _text(word),
        "transliteration": word.get("xlit") if word is not None else None,
        "partOfSpeech": _text(lexical.find("o:pos", NS)),
        "indexDefinition": _text(lexical.find("o:def", NS)),
        "bdbEntryId": bdb_id,
        "possibleSenses": definitions,
        "corpusReferences": references,
        "authority": "secondary-possibilities-only",
    }
