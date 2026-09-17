"""Paleo-Hebrew + AHRC evidence for OT source packets."""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

AHRC = ROOT / "source" / "hebrew" / "paleo-hebrew" / "data" / "ahrc" / "strongs.jsonl"
LETTER_MAP = ROOT / "source" / "hebrew" / "paleo-hebrew" / "data" / "letter-map.json"

NIQQUD = re.compile(r"[\u0591-\u05C7]")
LEMMA_NUM = re.compile(r"(\d+)")
PREF = {"c", "d", "b", "l", "m", "k", "i", "s"}


def strongs_from_lemma(lemma: str) -> str | None:
    parts = str(lemma or "").strip().split("/")
    i = 0
    while i < len(parts) - 1 and parts[i] in PREF:
        i += 1
    match = LEMMA_NUM.search("/".join(parts[i:]))
    if match:
        return f"H{int(match.group(1))}"
    match = LEMMA_NUM.search(str(lemma or ""))
    return f"H{int(match.group(1))}" if match else None


@lru_cache(maxsize=1)
def square_to_paleo() -> dict[str, str]:
    payload = json.loads(LETTER_MAP.read_text(encoding="utf-8"))
    return dict(payload["square_to_paleo"])


def to_paleo(hebrew: str) -> str:
    consonantal = NIQQUD.sub("", hebrew or "")
    mapping = square_to_paleo()
    return "".join(mapping.get(ch, ch) for ch in consonantal)


@lru_cache(maxsize=1)
def ahrc_index() -> dict[str, dict]:
    index: dict[str, dict] = {}
    if not AHRC.is_file():
        return index
    for line in AHRC.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        key = str(row.get("strongs") or "")
        if not key:
            continue
        index[key] = {
            "concreteSense": row.get("translation"),
            "definition": row.get("definition"),
            "parentRoot": row.get("parent_root"),
            "binding": "investigative-nonbinding",
        }
    return index


def ahrc_for(strongs: str | None) -> dict | None:
    if not strongs:
        return None
    return ahrc_index().get(strongs)
