#!/usr/bin/env python3
"""Seed Spanish→OSHB reverse-links for Zacarías. Biblia-LBF only.

Hand-only. Unwalked phrases get empty units (status=unwalked).
Never auto-zip. Never gloss DP.

Chapter 1 (phrases 0–20, Protestant 1:1–21): hand-mapped.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path("/Users/johnwry/Nextcloud/Documents/GitHub/Biblia-LBF")
PHRASES = ROOT / "alignment/ot/zacarias/zacarias-phrases.json"
OUT = ROOT / "alignment/ot/zacarias/zacarias-reverse-links.json"

# phraseIndex → list of (spanish surface to find, tokenRows 0-based indexes)
# Surfaces are found left-to-right. Source indexes may be non-sequential.
HAND: dict[int, list[tuple[str, list[int]]]] = {
    0: [
        ("En el mes", [0]),
        ("octavo", [1]),
        ("en el año", [2]),
        ("segundo", [3]),
        ("de Darío", [4]),
        ("vino", [5]),
        ("palabra", [6]),
        ("de Jehová", [7]),
        ("a", [8]),
        ("Zacarías", [9]),
        ("hijo", [10]),
        ("de Berequías", [11]),
        ("hijo", [12]),
        ("de Iddo", [13]),
        ("el profeta", [14]),
        ("diciendo", [15]),
    ],
    1: [
        ("Se airó", [0]),
        ("Jehová", [1]),
        ("contra", [2]),
        ("sus padres", [3]),
        ("con ira", [4]),
    ],
    2: [
        ("Y les dirás", [0, 1]),
        ("Así", [2]),
        ("dice", [3]),
        ("Jehová", [4]),
        ("de los ejércitos", [5]),
        ("Vuélvanse", [6]),
        ("a mí", [7]),
        ("declara", [8]),
        ("Jehová", [9]),
        ("de los ejércitos", [10]),
        ("y yo me volveré", [11]),
        ("a ustedes", [12]),
        ("dice", [13]),
        ("Jehová", [14]),
        ("de los ejércitos", [15]),
    ],
    3: [
        ("No", [0]),
        ("sean", [1]),
        ("como sus padres", [2]),
        ("a quienes", [3]),
        ("los primeros", [7]),
        ("profetas", [6]),
        ("proclamaron", [4, 5]),
        ("diciendo", [8]),
        ("Así", [9]),
        ("dice", [10]),
        ("Jehová", [11]),
        ("de los ejércitos", [12]),
        ("Vuélvanse", [13]),
        ("ahora", [14]),
        ("de sus malos caminos", [15, 16]),
        ("y de sus malas obras", [17, 18]),
        ("Y no", [19]),
        ("oyeron", [20]),
        ("ni", [21]),
        ("prestaron atención", [22]),
        ("a mí", [23]),
        ("declara", [24]),
        ("Jehová", [25]),
    ],
    4: [
        ("Sus padres", [0]),
        ("dónde", [1]),
        ("están", [2]),
        ("Y los profetas", [3]),
        ("para siempre", [4]),
        ("vivirán", [5]),
    ],
    5: [
        ("Pero", [0]),
        ("mis palabras", [1]),
        ("y mis estatutos", [2]),
        ("que", [3]),
        ("mandé", [4]),
        ("a mis siervos", [5, 6]),
        ("los profetas", [7]),
        ("no", [8]),
        ("alcanzaron", [9]),
        ("a sus padres", [10]),
        ("Y se volvieron", [11]),
        ("y dijeron", [12]),
        ("Como", [13]),
        ("Jehová", [15]),
        ("de los ejércitos", [16]),
        ("se propuso", [14]),
        ("hacer", [17]),
        ("con nosotros", [18]),
        ("conforme a nuestros caminos", [19]),
        ("y conforme a nuestras obras", [20]),
        ("así", [21]),
        ("hizo", [22]),
        ("con nosotros", [23]),
    ],
    6: [
        ("En el día", [0]),
        ("veinticuatro", [1, 2]),
        ("del mes undécimo", [3, 4, 5]),
        ("que es", [6]),
        ("el mes", [7]),
        ("de Sebat", [8]),
        ("en el año", [9]),
        ("segundo", [10]),
        ("de Darío", [11]),
        ("vino", [12]),
        ("palabra", [13]),
        ("de Jehová", [14]),
        ("a", [15]),
        ("Zacarías", [16]),
        ("hijo", [17]),
        ("de Berequías", [18]),
        ("hijo", [19]),
        ("de Iddo", [20]),
        ("el profeta", [21]),
        ("diciendo", [22]),
    ],
    7: [
        ("Vi", [0]),
        ("de noche", [1]),
        ("y he aquí", [2]),
        ("un hombre", [3]),
        ("cabalgando", [4]),
        ("sobre", [5]),
        ("un caballo", [6]),
        ("rojo", [7]),
        ("y él", [8]),
        ("estaba de pie", [9]),
        ("entre", [10]),
        ("los mirtos", [11]),
        ("que", [12]),
        ("había en la hondonada", [13]),
        ("y detrás de él", [14]),
        ("caballos", [15]),
        ("rojos", [16]),
        ("alazanes", [17]),
        ("y blancos", [18]),
    ],
    8: [
        ("Y dije", [0]),
        ("Qué", [1]),
        ("son estos", [2]),
        ("señor mío", [3]),
        ("Y me dijo", [4, 5]),
        ("el ángel", [6]),
        ("que hablaba", [7]),
        ("conmigo", [8]),
        ("Yo", [9]),
        ("te mostraré", [10]),
        ("qué", [11]),
        ("son", [12]),
        ("estos", [13]),
    ],
    9: [
        ("Y respondió", [0]),
        ("el hombre", [1]),
        ("que estaba de pie", [2]),
        ("entre", [3]),
        ("los mirtos", [4]),
        ("y dijo", [5]),
        ("Estos", [6]),
        ("son los que", [7]),
        ("Jehová", [9]),
        ("envió", [8]),
        ("a recorrer", [10]),
        ("la tierra", [11]),
    ],
    10: [
        ("Y respondieron", [0]),
        ("al ángel", [1, 2]),
        ("de Jehová", [3]),
        ("que estaba de pie", [4]),
        ("entre", [5]),
        ("los mirtos", [6]),
        ("y dijeron", [7]),
        ("Hemos recorrido", [8]),
        ("la tierra", [9]),
        ("y he aquí", [10]),
        ("toda", [11]),
        ("la tierra", [12]),
        ("está asentada", [13]),
        ("y quieta", [14]),
    ],
    11: [
        ("Y respondió", [0]),
        ("el ángel", [1]),
        ("de Jehová", [2]),
        ("y dijo", [3]),
        ("Jehová", [4]),
        ("de los ejércitos", [5]),
        ("hasta", [6]),
        ("cuándo", [7]),
        ("tú", [8]),
        ("no", [9]),
        ("tendrás compasión", [10]),
        ("de Jerusalén", [11, 12]),
        ("y de las ciudades", [13, 14]),
        ("de Judá", [15]),
        ("contra las cuales", [16]),
        ("te has indignado", [17]),
        ("estos", [18]),
        ("setenta", [19]),
        ("años", [20]),
    ],
    12: [
        ("Y respondió", [0]),
        ("Jehová", [1]),
        ("al ángel", [2, 3]),
        ("que hablaba", [4]),
        ("conmigo", [5]),
        ("palabras", [6]),
        ("buenas", [7]),
        ("palabras", [8]),
        ("de consuelo", [9]),
    ],
    13: [
        ("Y me dijo", [0, 1]),
        ("el ángel", [2]),
        ("que hablaba", [3]),
        ("conmigo", [4]),
        ("Proclama", [5]),
        ("diciendo", [6]),
        ("Así", [7]),
        ("dice", [8]),
        ("Jehová", [9]),
        ("de los ejércitos", [10]),
        ("Celé", [11]),
        ("por Jerusalén", [12]),
        ("y por Sión", [13]),
        ("con gran celo", [14, 15]),
    ],
    14: [
        ("Y con gran ira", [0, 1]),
        ("estoy yo airado", [2, 3]),
        ("contra", [4]),
        ("las naciones", [5]),
        ("que están tranquilas", [6]),
        ("las cuales", [7]),
        ("yo", [8]),
        ("airé", [9]),
        ("un poco", [10]),
        ("y ellas", [11]),
        ("ayudaron", [12]),
        ("para mal", [13]),
    ],
    15: [
        ("Por tanto", [0]),
        ("así", [1]),
        ("dice", [2]),
        ("Jehová", [3]),
        ("Me he vuelto", [4]),
        ("a Jerusalén", [5]),
        ("con compasiones", [6]),
        ("mi casa", [7]),
        ("será edificada", [8]),
        ("en ella", [9]),
        ("declara", [10]),
        ("Jehová", [11]),
        ("de los ejércitos", [12]),
        ("y el cordel", [13]),
        ("será tendido", [14]),
        ("sobre", [15]),
        ("Jerusalén", [16]),
    ],
    16: [
        ("Proclama", [1]),
        ("otra vez", [0]),
        ("diciendo", [2]),
        ("Así", [3]),
        ("dice", [4]),
        ("Jehová", [5]),
        ("de los ejércitos", [6]),
        ("Aún", [7]),
        ("rebosarán", [8]),
        ("mis ciudades", [9]),
        ("de bien", [10]),
        ("y aún consolará", [11, 13]),
        ("Jehová", [12]),
        ("a Sión", [14, 15]),
        ("y aún escogerá", [16, 17]),
        ("a Jerusalén", [18]),
    ],
    17: [
        ("Y alcé", [0]),
        ("mis ojos", [1, 2]),
        ("y vi", [3]),
        ("y he aquí", [4]),
        ("cuatro", [5]),
        ("cuernos", [6]),
    ],
    18: [
        ("Y dije", [0]),
        ("al ángel", [1, 2]),
        ("que hablaba", [3]),
        ("conmigo", [4]),
        ("Qué", [5]),
        ("son estos", [6]),
        ("Y me dijo", [7, 8]),
        ("Estos", [9]),
        ("son los cuernos", [10]),
        ("que", [11]),
        ("dispersaron", [12]),
        ("a Judá", [13, 14]),
        ("a Israel", [15, 16]),
        ("y a Jerusalén", [17]),
    ],
    19: [
        ("Y me mostró", [0]),
        ("Jehová", [1]),
        ("cuatro", [2]),
        ("artesanos", [3]),
    ],
    20: [
        ("Y dije", [0]),
        ("Qué", [1]),
        ("vienen", [3]),
        ("estos", [2]),
        ("a hacer", [4]),
        ("Y dijo", [5]),
        ("diciendo", [6]),
        ("Estos", [7]),
        ("son los cuernos", [8]),
        ("que", [9]),
        ("dispersaron", [10]),
        ("a Judá", [11, 12]),
        ("de modo que", [13]),
        ("nadie", [14, 15]),
        ("alzó", [16]),
        ("su cabeza", [17]),
        ("y vinieron", [18]),
        ("estos", [19]),
        ("para aterrarlos", [20, 21]),
        ("para derribar", [22]),
        ("los cuernos", [23, 24]),
        ("de las naciones", [25]),
        ("que alzan", [26]),
        ("cuerno", [27]),
        ("contra", [28]),
        ("la tierra", [29]),
        ("de Judá", [30]),
        ("para dispersarla", [31]),
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
            missing = [r["sourceTokenId"] + " " + r["surface"] for r in p["tokenRows"] if r["sourceTokenId"] not in linked]
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
        "bookId": "zacarias",
        "textualBasis": "OSHB/WLC",
        "schemaVersion": 1,
        "numbering": "protestant",
        "links": links,
    }
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"hand={hand_n} unwalked={unwalked_n} wrote {OUT}")


if __name__ == "__main__":
    main()
