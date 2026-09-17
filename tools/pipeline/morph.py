"""Compact OSHB morph expansions for source packets."""

from __future__ import annotations

HEBREW_POS = {
    "A": "adjective",
    "C": "conjunction",
    "D": "adverb",
    "N": "noun",
    "P": "pronoun",
    "R": "preposition",
    "S": "suffix",
    "T": "particle",
    "V": "verb",
}
NOUN_TYPE = {"c": "common", "g": "gentilic", "p": "proper"}
ADJ_TYPE = {"a": "adjective", "c": "cardinal", "g": "gentilic", "o": "ordinal"}
PRON_TYPE = {
    "d": "demonstrative",
    "f": "indefinite",
    "i": "interrogative",
    "p": "personal",
    "r": "relative",
}
PARTICLE_TYPE = {
    "a": "affirmation",
    "d": "definite article",
    "j": "interjection",
    "m": "demonstrative",
    "n": "negative",
    "o": "direct object marker",
    "r": "relative",
}
VERB_STEM = {
    "q": "qal",
    "N": "niphal",
    "p": "piel",
    "P": "pual",
    "h": "hiphil",
    "H": "hophal",
    "t": "hithpael",
}
VERB_TYPE = {
    "p": "perfect",
    "q": "sequential perfect",
    "i": "imperfect",
    "w": "sequential imperfect",
    "h": "cohortative",
    "j": "jussive",
    "v": "imperative",
    "r": "participle active",
    "s": "participle passive",
    "a": "infinitive absolute",
    "c": "infinitive construct",
}
GENDER = {"b": "both", "c": "common", "f": "feminine", "m": "masculine"}
NUMBER = {"d": "dual", "p": "plural", "s": "singular"}
STATE = {"a": "absolute", "c": "construct", "d": "determined"}
PERSON = {"1": "1st", "2": "2nd", "3": "3rd"}


def expand_hebrew_morph(morph: str) -> str:
    """Turn an OSHB morph string such as HTd/Ncmda into a short English gloss."""
    raw = (morph or "").strip()
    if not raw:
        return ""
    parts = raw.split("/")
    bits: list[str] = []
    if parts and parts[0][:1] in {"H", "A"}:
        bits.append("Hebrew" if parts[0].startswith("H") else "Aramaic")
        parts[0] = parts[0][1:]
    for part in parts:
        if not part:
            continue
        pos, rest = part[0], part[1:]
        if pos == "V" and rest:
            stem = VERB_STEM.get(rest[0], rest[0])
            vtype = VERB_TYPE.get(rest[1], rest[1]) if len(rest) > 1 else ""
            person = PERSON.get(rest[2], "") if len(rest) > 2 else ""
            gender = GENDER.get(rest[3], "") if len(rest) > 3 else ""
            number = NUMBER.get(rest[4], "") if len(rest) > 4 else ""
            bits.append(" ".join(x for x in (stem, vtype, person, gender, number) if x))
            continue
        if pos == "N":
            ntype = NOUN_TYPE.get(rest[0], "") if rest else ""
            gender = GENDER.get(rest[1], "") if len(rest) > 1 else ""
            number = NUMBER.get(rest[2], "") if len(rest) > 2 else ""
            state = STATE.get(rest[3], "") if len(rest) > 3 else ""
            bits.append(" ".join(x for x in ("noun", ntype, gender, number, state) if x))
            continue
        if pos == "A":
            atype = ADJ_TYPE.get(rest[0], "adjective") if rest else "adjective"
            gender = GENDER.get(rest[1], "") if len(rest) > 1 else ""
            number = NUMBER.get(rest[2], "") if len(rest) > 2 else ""
            state = STATE.get(rest[3], "") if len(rest) > 3 else ""
            bits.append(" ".join(x for x in (atype, gender, number, state) if x))
            continue
        if pos == "P":
            ptype = PRON_TYPE.get(rest[0], "pronoun") if rest else "pronoun"
            person = PERSON.get(rest[1], "") if len(rest) > 1 else ""
            gender = GENDER.get(rest[2], "") if len(rest) > 2 else ""
            number = NUMBER.get(rest[3], "") if len(rest) > 3 else ""
            bits.append(" ".join(x for x in (ptype, person, gender, number) if x))
            continue
        if pos == "S":
            person = PERSON.get(rest[1], "") if len(rest) > 1 else ""
            gender = GENDER.get(rest[2], "") if len(rest) > 2 else ""
            number = NUMBER.get(rest[3], "") if len(rest) > 3 else ""
            bits.append(" ".join(x for x in ("suffix", person, gender, number) if x))
            continue
        if pos == "T":
            bits.append(PARTICLE_TYPE.get(rest[:1], "particle") if rest else "particle")
            continue
        bits.append(HEBREW_POS.get(pos, pos))
    return "; ".join(bits)
