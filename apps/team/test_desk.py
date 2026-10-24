#!/usr/bin/env python3
"""Safety tests for the named-human chapter desk. No model calls."""
from __future__ import annotations
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import desk

class DeskTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); root=Path(self.tmp.name)
        self.old=(desk.VAR,desk.CLAIMS,desk.PEOPLE,desk.RECOVERED)
        desk.VAR=root;desk.CLAIMS=root/"claims.json";desk.PEOPLE=root/"people.json";desk.RECOVERED=root/"recovered-reviews"
        desk.PEOPLE.write_text('{"Ana":"11111111","Luis":"22222222"}\n',encoding="utf-8")
    def tearDown(self):
        desk.VAR,desk.CLAIMS,desk.PEOPLE,desk.RECOVERED=self.old;self.tmp.cleanup()
    def test_model_is_fixed_to_sol(self):
        self.assertEqual(desk.model_name(),"gpt-5.6-sol")
        self.assertEqual(desk.reasoning_effort(),"medium")
    def test_divine_name_is_locked(self):
        packet={"tokens":[{"sourceTokenId":"h1","lemma":"c/3068"}]}
        self.assertEqual(desk.lint_divine_name("Y dijo Yahvé",packet),[])
        self.assertTrue(desk.lint_divine_name("Y dijo el SEÑOR",packet))
        self.assertTrue(desk.lint_spanish("Y dijo Jehová"))
    def test_claim_is_per_chapter(self):
        with patch.object(desk,"chapter_or_raise",side_effect=lambda s,c:(type("B",(),{"slug":s,"label":"Éxodo"})(),int(c),[1])):
            desk.claim("Ana","exodo",3,"11111111");desk.claim("Luis","exodo",4,"22222222")
            with self.assertRaises(ValueError):desk.claim("Luis","exodo",3,"22222222")
            self.assertIn("exodo:3",desk.load_claims());self.assertIn("exodo:4",desk.load_claims())
    def test_nt_is_blocked(self):
        with self.assertRaises(ValueError):desk.book_or_raise("mateo")
    def test_alignment_requires_complete_token_coverage(self):
        packet={"tokens":[{"sourceTokenId":"h1"},{"sourceTokenId":"h2"}]}
        with self.assertRaises(ValueError):desk.validate_units(packet,[{"es":"Uno","sourceTokenIds":["h1"]}])
        self.assertEqual(len(desk.validate_units(packet,[{"es":"Uno","sourceTokenIds":["h1"]},{"es":"dos","sourceTokenIds":["h2"]}],"Uno, dos.")),2)
        with self.assertRaises(ValueError):desk.validate_units(packet,[{"es":"Uno","sourceTokenIds":["h1"]},{"es":"tres","sourceTokenIds":["h2"]}],"Uno, dos.")
    def test_verse_scanner(self):
        text="# Éxodo\n\n## Capítulo 3\n\n### 3:1\n\nTexto.\n\n### 3:2\n\n"
        self.assertEqual(desk.verse_body(text,3,1),"Texto.");self.assertEqual(desk.verse_body(text,3,2),"");self.assertIsNone(desk.verse_body(text,3,9))
    def test_recovered_review_is_noncanonical_app_state(self):
        self.assertEqual(desk.recovered_path("exodo",3),desk.RECOVERED/"exodo-3.json")
    def test_failed_review_attempt_can_be_recovered_before_validation(self):
        book=type("B",(),{"slug":"exodo"})()
        payload={"spanish":"Texto revisado","units":[{"es":"Texto revisado","sourceTokenIds":["h1"]}],"decision":"","sourceConfirmed":True,"alignmentConfirmed":True}
        desk.save_review_attempt(book,3,1,"Ana",payload)
        saved=desk.read_json(desk.recovered_path("exodo",3),{})["verses"]["1"]
        self.assertEqual(saved["spanish"],"Texto revisado")
        self.assertEqual(saved["lastAttemptedBy"],"Ana")
    def test_notification_ui_is_accessible_and_explains_credentials(self):
        html=(Path(desk.__file__).resolve().parent/"public"/"index.html").read_text(encoding="utf-8")
        self.assertIn('id="notifications" aria-live="polite"',html)
        self.assertIn("no la clave OpenAI",html)
        self.assertIn("Tu trabajo permanece guardado en este navegador",html)

if __name__=="__main__":unittest.main()
