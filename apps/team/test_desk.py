#!/usr/bin/env python3
"""Claim rules and verse scanning. No model calls."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import desk


class DeskTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        desk.CLAIMS = Path(self.tmp.name) / "claims.json"
        desk.PEOPLE = Path(self.tmp.name) / "people.json"
        desk.VAR = Path(self.tmp.name)
        desk.PEOPLE.write_text('{"Ana": "11111111", "Luis": "22222222"}\n', encoding="utf-8")

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def test_one_holder_per_book(self) -> None:
        desk.claim("Ana", "rut", "11111111")
        with self.assertRaises(ValueError):
            desk.claim("Luis", "rut", "22222222")
        desk.claim("Ana", "rut", "11111111")
        desk.release("Ana", "rut", "11111111")
        desk.claim("Luis", "rut", "22222222")

    def test_release_refuses_another_name(self) -> None:
        desk.claim("Ana", "joel", "11111111")
        with self.assertRaises(ValueError):
            desk.release("Luis", "joel", "22222222")

    def test_start_requires_the_holder(self) -> None:
        with self.assertRaises(ValueError):
            desk.start("Ana", "rut", "11111111")
        with self.assertRaises(ValueError):
            desk.claim("Ana", "rut", "00000000")

    def test_verse_body_and_filled_count(self) -> None:
        text = "\n".join([
            "# Rut",
            "",
            "## Capítulo 1",
            "",
            "### 1:1",
            "",
            "En los días en que juzgaban los jueces.",
            "",
            "### 1:2",
            "",
            "### 1:3",
            "",
            "Y murió Elimelec.",
        ])
        self.assertEqual(desk.verse_body(text, 1, 1), "En los días en que juzgaban los jueces.")
        self.assertEqual(desk.verse_body(text, 1, 2), "")
        self.assertIsNone(desk.verse_body(text, 1, 9))
        self.assertEqual(desk.filled_count(text), 2)


if __name__ == "__main__":
    unittest.main()
