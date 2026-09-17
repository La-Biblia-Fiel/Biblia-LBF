"""Book catalog for the translation pipeline. Protestant slugs only."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True)
class Book:
    slug: str
    testament: str  # ot | nt
    label: str
    book_code: int
    osis: str = ""
    xml_name: str = ""
    utr_stem: str = ""

    @property
    def xml_path(self) -> Path:
        return ROOT / "source" / "hebrew" / "OSHB" / "morphhb" / "wlc" / self.xml_name

    @property
    def utr_path(self) -> Path:
        return ROOT / "source" / "greek" / "TR1894" / "robinson-parsed" / f"{self.utr_stem}.UTR"


OT: list[Book] = [
    Book("genesis", "ot", "Génesis", 1, "Gen", "Gen.xml"),
    Book("exodo", "ot", "Éxodo", 2, "Exod", "Exod.xml"),
    Book("levitico", "ot", "Levítico", 3, "Lev", "Lev.xml"),
    Book("numeros", "ot", "Números", 4, "Num", "Num.xml"),
    Book("deuteronomio", "ot", "Deuteronomio", 5, "Deut", "Deut.xml"),
    Book("josue", "ot", "Josué", 6, "Josh", "Josh.xml"),
    Book("jueces", "ot", "Jueces", 7, "Judg", "Judg.xml"),
    Book("rut", "ot", "Rut", 8, "Ruth", "Ruth.xml"),
    Book("1samuel", "ot", "1 Samuel", 9, "1Sam", "1Sam.xml"),
    Book("2samuel", "ot", "2 Samuel", 10, "2Sam", "2Sam.xml"),
    Book("1reyes", "ot", "1 Reyes", 11, "1Kgs", "1Kgs.xml"),
    Book("2reyes", "ot", "2 Reyes", 12, "2Kgs", "2Kgs.xml"),
    Book("1cronicas", "ot", "1 Crónicas", 13, "1Chr", "1Chr.xml"),
    Book("2cronicas", "ot", "2 Crónicas", 14, "2Chr", "2Chr.xml"),
    Book("esdras", "ot", "Esdras", 15, "Ezra", "Ezra.xml"),
    Book("nehemias", "ot", "Nehemías", 16, "Neh", "Neh.xml"),
    Book("ester", "ot", "Ester", 17, "Esth", "Esth.xml"),
    Book("job", "ot", "Job", 18, "Job", "Job.xml"),
    Book("salmos", "ot", "Salmos", 19, "Ps", "Ps.xml"),
    Book("proverbios", "ot", "Proverbios", 20, "Prov", "Prov.xml"),
    Book("eclesiastes", "ot", "Eclesiastés", 21, "Eccl", "Eccl.xml"),
    Book("cantares", "ot", "Cantares", 22, "Song", "Song.xml"),
    Book("isaias", "ot", "Isaías", 23, "Isa", "Isa.xml"),
    Book("jeremias", "ot", "Jeremías", 24, "Jer", "Jer.xml"),
    Book("lamentaciones", "ot", "Lamentaciones", 25, "Lam", "Lam.xml"),
    Book("ezequiel", "ot", "Ezequiel", 26, "Ezek", "Ezek.xml"),
    Book("daniel", "ot", "Daniel", 27, "Dan", "Dan.xml"),
    Book("oseas", "ot", "Oseas", 28, "Hos", "Hos.xml"),
    Book("joel", "ot", "Joel", 29, "Joel", "Joel.xml"),
    Book("amos", "ot", "Amós", 30, "Amos", "Amos.xml"),
    Book("abdias", "ot", "Abdías", 31, "Obad", "Obad.xml"),
    Book("jonas", "ot", "Jonás", 32, "Jonah", "Jonah.xml"),
    Book("miqueas", "ot", "Miqueas", 33, "Mic", "Mic.xml"),
    Book("nahum", "ot", "Nahum", 34, "Nah", "Nah.xml"),
    Book("habacuc", "ot", "Habacuc", 35, "Hab", "Hab.xml"),
    Book("sofonias", "ot", "Sofonías", 36, "Zeph", "Zeph.xml"),
    Book("hageo", "ot", "Hageo", 37, "Hag", "Hag.xml"),
    Book("zacarias", "ot", "Zacarías", 38, "Zech", "Zech.xml"),
    Book("malaquias", "ot", "Malaquías", 39, "Mal", "Mal.xml"),
]

NT: list[Book] = [
    Book("mateo", "nt", "Mateo", 40, utr_stem="MT"),
    Book("marcos", "nt", "Marcos", 41, utr_stem="MR"),
    Book("lucas", "nt", "Lucas", 42, utr_stem="LU"),
    Book("juan", "nt", "Juan", 43, utr_stem="JOH"),
    Book("hechos", "nt", "Hechos", 44, utr_stem="AC"),
    Book("romanos", "nt", "Romanos", 45, utr_stem="RO"),
    Book("1corintios", "nt", "1 Corintios", 46, utr_stem="1CO"),
    Book("2corintios", "nt", "2 Corintios", 47, utr_stem="2CO"),
    Book("galatas", "nt", "Gálatas", 48, utr_stem="GA"),
    Book("efesios", "nt", "Efesios", 49, utr_stem="EPH"),
    Book("filipenses", "nt", "Filipenses", 50, utr_stem="PHP"),
    Book("colosenses", "nt", "Colosenses", 51, utr_stem="COL"),
    Book("1tesalonicenses", "nt", "1 Tesalonicenses", 52, utr_stem="1TH"),
    Book("2tesalonicenses", "nt", "2 Tesalonicenses", 53, utr_stem="2TH"),
    Book("1timoteo", "nt", "1 Timoteo", 54, utr_stem="1TI"),
    Book("2timoteo", "nt", "2 Timoteo", 55, utr_stem="2TI"),
    Book("titus", "nt", "Tito", 56, utr_stem="TIT"),
    Book("filemon", "nt", "Filemón", 57, utr_stem="PHM"),
    Book("hebreos", "nt", "Hebreos", 58, utr_stem="HEB"),
    Book("santiago", "nt", "Santiago", 59, utr_stem="JAS"),
    Book("1pedro", "nt", "1 Pedro", 60, utr_stem="1PE"),
    Book("2pedro", "nt", "2 Pedro", 61, utr_stem="2PE"),
    Book("1juan", "nt", "1 Juan", 62, utr_stem="1JO"),
    Book("2juan", "nt", "2 Juan", 63, utr_stem="2JO"),
    Book("3juan", "nt", "3 Juan", 64, utr_stem="3JO"),
    Book("judas", "nt", "Judas", 65, utr_stem="JUDE"),
    Book("apocalipsis", "nt", "Apocalipsis", 66, utr_stem="RE"),
]

BOOKS = {book.slug: book for book in (*OT, *NT)}


def get_book(slug: str) -> Book:
    book = BOOKS.get(slug)
    if book is None:
        known = ", ".join(sorted(BOOKS))
        raise KeyError(f"unknown book slug {slug!r}. Known: {known}")
    return book
