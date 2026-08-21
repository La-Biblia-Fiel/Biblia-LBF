#!/usr/bin/env python3
"""Seed Spanish→OSHB reverse-links for Daniel. Biblia-LBF only.

Hand-only. Unwalked phrases get empty units (status=unwalked).
Never auto-zip. Never gloss DP.

Chapter 1 (phrases 0–20, Protestant 1:1–21): hand-mapped.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path("/Users/johnwry/Nextcloud/Documents/GitHub/Biblia-LBF")
PHRASES = ROOT / "alignment/ot/daniel/daniel-phrases.json"
OUT = ROOT / "alignment/ot/daniel/daniel-reverse-links.json"

# phraseIndex → list of (spanish surface to find, tokenRows 0-based indexes)
# Surfaces are found left-to-right. Source indexes may be non-sequential.
HAND: dict[int, list[tuple[str, list[int]]]] = {
    0: [
        ("En el año", [0]),
        ("tercero", [1]),
        ("del reino", [2]),
        ("de Joacim", [3]),
        ("rey", [4]),
        ("de Judá", [5]),
        ("vino", [6]),
        ("Nabucodonosor", [7]),
        ("rey", [8]),
        ("de Babel", [9]),
        ("a Jerusalén", [10]),
        ("y la sitió", [11, 12]),
    ],
    1: [
        ("Y el Señor dio", [0, 1]),
        ("en su mano", [2]),
        ("a Joacim", [3, 4]),
        ("rey", [5]),
        ("de Judá", [6]),
        ("y parte", [7]),
        ("de los utensilios", [8]),
        ("de la casa", [9]),
        ("de Dios", [10]),
        ("y los llevó", [11]),
        ("a la tierra", [12]),
        ("de Sinar", [13]),
        ("a la casa", [14]),
        ("de su dios", [15]),
        ("y", [16]),
        ("los utensilios", [17]),
        ("llevó", [18]),
        ("a la casa", [19]),
        ("del tesoro", [20]),
        ("de su dios", [21]),
    ],
    2: [
        ("Y el rey dijo", [0, 1]),
        ("a Aspenaz", [2]),
        ("jefe", [3]),
        ("de sus eunucos", [4]),
        ("que trajera", [5]),
        ("de los hijos", [6]),
        ("de Israel", [7]),
        ("y de la simiente", [8]),
        ("real", [9]),
        ("y", [10]),
        ("de los nobles", [11]),
    ],
    3: [
        ("jóvenes", [0]),
        ("en los cuales", [1, 3]),
        ("no hubiera", [2]),
        ("ninguna", [4]),
        ("mancha", [5, 6]),
        ("y de buena", [7]),
        ("apariencia", [8]),
        ("e inteligentes", [9]),
        ("en toda", [10]),
        ("sabiduría", [11]),
        ("y conocedores", [12]),
        ("de conocimiento", [13]),
        ("y entendidos", [14]),
        ("en ciencia", [15]),
        ("y que", [16]),
        ("tuvieran fuerza", [17]),
        ("en ellos", [18]),
        ("para estar", [19]),
        ("en el palacio", [20]),
        ("del rey", [21]),
        ("y para enseñarles", [22]),
        ("la escritura", [23]),
        ("y la lengua", [24]),
        ("de los caldeos", [25]),
    ],
    4: [
        ("Y el rey les asignó", [0, 1, 2]),
        ("una porción diaria", [3, 4, 5]),
        ("de los manjares", [6, 7]),
        ("del rey", [8]),
        ("y del vino", [9]),
        ("de su beber", [10]),
        ("y para educarlos", [11]),
        ("tres", [13]),
        ("años", [12]),
        ("y al cabo de ellos", [14]),
        ("estarían", [15]),
        ("delante", [16]),
        ("del rey", [17]),
    ],
    5: [
        ("Y hubo", [0]),
        ("entre ellos", [1]),
        ("de los hijos", [2]),
        ("de Judá", [3]),
        ("Daniel", [4]),
        ("Ananías", [5]),
        ("Misael", [6]),
        ("y Azarías", [7]),
    ],
    6: [
        ("Y el jefe de los eunucos les puso", [0, 1, 2, 3]),
        ("nombres", [4]),
        ("puso", [5]),
        ("a Daniel", [6]),
        ("Beltsasar", [7]),
        ("y a Ananías", [8]),
        ("Sadrac", [9]),
        ("y a Misael", [10]),
        ("Mesac", [11]),
        ("y a Azarías", [12]),
        ("Abed-nego", [13, 14]),
    ],
    7: [
        ("Y Daniel puso", [0, 1]),
        ("en su corazón", [2, 3]),
        ("que", [4]),
        ("no", [5]),
        ("se contaminaría", [6]),
        ("con los manjares", [7]),
        ("del rey", [8]),
        ("ni con el vino", [9]),
        ("de su beber", [10]),
        ("y recurrió", [11]),
        ("al jefe", [12]),
        ("de los eunucos", [13]),
        ("que", [14]),
        ("no", [15]),
        ("se contaminara", [16]),
    ],
    8: [
        ("Y Dios dio", [0, 1]),
        ("a Daniel", [2, 3]),
        ("misericordia", [4]),
        ("y compasiones", [5]),
        ("delante", [6]),
        ("del jefe", [7]),
        ("de los eunucos", [8]),
    ],
    9: [
        ("Y el jefe de los eunucos dijo", [0, 1, 2]),
        ("a Daniel", [3]),
        ("Yo temo", [4, 5]),
        ("a mi señor", [6, 7]),
        ("el rey", [8]),
        ("que", [9]),
        ("ha asignado", [10]),
        ("su comida", [11, 12]),
        ("y", [13]),
        ("su bebida", [14]),
        ("¿por qué", [15, 16]),
        ("ha de ver", [17]),
        ("sus rostros", [18, 19]),
        ("más tristes", [20]),
        ("que los de los jóvenes", [21, 22]),
        ("que", [23]),
        ("son como ustedes", [24]),
        ("Y pondrán en peligro", [25]),
        ("mi cabeza", [26, 27]),
        ("ante el rey", [28]),
    ],
    10: [
        ("Y Daniel dijo", [0, 1]),
        ("al mayordomo", [2, 3]),
        ("a quien", [4]),
        ("el jefe", [6]),
        ("de los eunucos", [7]),
        ("había encargado", [5]),
        ("de", [8]),
        ("Daniel", [9]),
        ("Ananías", [10]),
        ("Misael", [11]),
        ("y Azarías", [12]),
    ],
    11: [
        ("Prueba", [0]),
        ("por favor", [1]),
        ("a tus siervos", [2, 3]),
        ("diez", [5]),
        ("días", [4]),
        ("y que nos den", [6, 7]),
        ("de", [8]),
        ("las legumbres", [9]),
        ("y comamos", [10]),
        ("y agua", [11]),
        ("y bebamos", [12]),
    ],
    12: [
        ("Y se vean", [0]),
        ("delante de ti", [1]),
        ("nuestras apariencias", [2]),
        ("y la apariencia", [3]),
        ("de los jóvenes", [4]),
        ("que comen", [5]),
        ("los manjares", [6, 7]),
        ("del rey", [8]),
        ("y según", [9]),
        ("veas", [10]),
        ("haz", [11]),
        ("con", [12]),
        ("tus siervos", [13]),
    ],
    13: [
        ("Y les escuchó", [0, 1]),
        ("en esta palabra", [2, 3]),
        ("y los probó", [4]),
        ("diez", [6]),
        ("días", [5]),
    ],
    14: [
        ("Y al cabo", [0]),
        ("de los diez días", [1, 2]),
        ("se vio", [3]),
        ("que su apariencia", [4]),
        ("era buena", [5]),
        ("y estaban más rollizos", [6]),
        ("de carne", [7]),
        ("que", [8]),
        ("todos", [9]),
        ("los jóvenes", [10]),
        ("que comían", [11]),
        ("los manjares", [12, 13]),
        ("del rey", [14]),
    ],
    15: [
        ("Y aconteció", [0]),
        ("que el mayordomo", [1]),
        ("quitaba", [2]),
        ("sus manjares", [3, 4]),
        ("y el vino", [5]),
        ("de su beber", [6]),
        ("y les daba", [7, 8]),
        ("legumbres", [9]),
    ],
    16: [
        ("Y a estos cuatro jóvenes", [0, 1, 2]),
        ("Dios les dio", [3, 4, 5]),
        ("conocimiento", [6]),
        ("y entendimiento", [7]),
        ("en toda", [8]),
        ("escritura", [9]),
        ("y sabiduría", [10]),
        ("y Daniel", [11]),
        ("entendía", [12]),
        ("en toda", [13]),
        ("visión", [14]),
        ("y sueños", [15]),
    ],
    17: [
        ("Y al cabo", [0]),
        ("de los días", [1]),
        ("en que", [2]),
        ("el rey", [4]),
        ("había dicho", [3]),
        ("que los trajeran", [5]),
        ("el jefe", [7]),
        ("de los eunucos", [8]),
        ("los trajo", [6]),
        ("delante", [9]),
        ("de Nabucodonosor", [10]),
    ],
    18: [
        ("Y el rey habló", [0, 2]),
        ("con ellos", [1]),
        ("y no", [3]),
        ("se halló", [4]),
        ("entre todos ellos", [5]),
        ("ninguno como Daniel", [6]),
        ("Ananías", [7]),
        ("Misael", [8]),
        ("y Azarías", [9]),
        ("y estuvieron", [10]),
        ("delante", [11]),
        ("del rey", [12]),
    ],
    19: [
        ("Y en todo", [0]),
        ("asunto", [1]),
        ("de sabiduría", [2]),
        ("de entendimiento", [3]),
        ("que", [4]),
        ("el rey", [7]),
        ("les", [6]),
        ("preguntó", [5]),
        ("los halló", [8]),
        ("diez veces", [9, 10]),
        ("superiores", [11]),
        ("a todos", [12]),
        ("los magos", [13]),
        ("y encantadores", [14]),
        ("que", [15]),
        ("había en todo", [16]),
        ("su reino", [17]),
    ],
    20: [
        ("Y Daniel estuvo", [0, 1]),
        ("hasta", [2]),
        ("el año", [3]),
        ("primero", [4]),
        ("del rey", [6]),
        ("Ciro", [5]),
    ],
}


def find_surface(spanish: str, needle: str, cursor: int) -> tuple[int, int]:
    pos = spanish.find(needle, cursor)
    if pos < 0:
        raise ValueError(f"surface not found from {cursor}: {needle!r} in {spanish!r}")
    return pos, pos + len(needle)


def units_for(phrase: dict, hand: list[tuple[str, list[int]]]) -> list[dict]:
    spanish = phrase["spanish"]
    rows = phrase["tokenRows"]
    cursor = 0
    raw: list[tuple[int, int, list[int]]] = []
    for surface, indexes in hand:
        start, end = find_surface(spanish, surface, cursor)
        for i in indexes:
            if i < 0 or i >= len(rows):
                raise ValueError(f"{phrase['reference']} bad row {i} (n={len(rows)})")
        raw.append((start, end, indexes))
        cursor = end
    units = []
    for u, (start, end, indexes) in enumerate(raw):
        span_start = 0 if u == 0 else start
        span_end = raw[u + 1][0] if u + 1 < len(raw) else len(spanish)
        ids = [rows[i]["sourceTokenId"] for i in indexes]
        units.append(
            {
                "unitId": f"{phrase['phraseIndex']}:{u}",
                "surface": spanish[span_start:span_end],
                "charStart": span_start,
                "charEnd": span_end,
                "sourceTokenIds": ids,
                "method": "hand",
            }
        )
    return units


def main() -> None:
    phrases = json.loads(PHRASES.read_text(encoding="utf-8"))
    links = []
    errors: list[str] = []
    hand_n = 0
    unwalked_n = 0
    for p in phrases:
        idx = p["phraseIndex"]
        if idx in HAND:
            try:
                units = units_for(p, HAND[idx])
            except ValueError as e:
                errors.append(str(e))
                continue
            linked: set[str] = set()
            for u in units:
                linked.update(u["sourceTokenIds"])
            missing = [
                r["sourceTokenId"] + " " + r["surface"]
                for r in p["tokenRows"]
                if r["sourceTokenId"] not in linked
            ]
            extra = linked - set(p["sourceTokenIds"])
            if missing:
                errors.append(f"{p['reference']} uncovered: {missing}")
            if extra:
                errors.append(f"{p['reference']} extra ids: {sorted(extra)}")
            covered = "".join(u["surface"] for u in units)
            if covered != p["spanish"]:
                errors.append(f"{p['reference']} spanish gap: {covered!r} != {p['spanish']!r}")
            links.append(
                {
                    "phraseIndex": idx,
                    "reference": p["reference"],
                    "status": "seeded-hand",
                    "units": units,
                }
            )
            hand_n += 1
        else:
            links.append(
                {
                    "phraseIndex": idx,
                    "reference": p["reference"],
                    "status": "unwalked",
                    "units": [],
                }
            )
            unwalked_n += 1
    if errors:
        print("SEED FAILED", file=sys.stderr)
        for e in errors:
            print(e, file=sys.stderr)
        sys.exit(1)
    doc = {
        "bookId": "daniel",
        "textualBasis": "OSHB/WLC",
        "schemaVersion": 1,
        "numbering": "protestant",
        "links": links,
    }
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"hand={hand_n} unwalked={unwalked_n} wrote {OUT}")


if __name__ == "__main__":
    main()
