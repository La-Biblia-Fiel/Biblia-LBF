"""auto_pass calls Cursor Auto, then Sonnet once when a verse is questionable."""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

import auto_pass

OLD = "pueblo mucho y recio de nosotros"
NEW = "pueblo más numeroso y más fuerte que nosotros"
TOKEN = "h02001009008"


class AutoPassTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.calls: list[str] = []
        self.packet = {
            "book": "exodo",
            "reference": "Éxodo 1:9",
            "chapter": 1,
            "verse": 9,
            "textualBasis": "OSHB/WLC",
            "tokens": [{"sourceTokenId": TOKEN, "surface": "רב"}],
        }
        self.book = self.tmp / "book.md"
        self.book.write_text(
            "# Éxodo\n\n## Capítulo 1\n\n### 1:9\n\n" + OLD + "\n\n### 1:10\n\nDa, seamos sabios.\n",
            encoding="utf-8",
        )
        self.patches = patch.multiple(
            auto_pass,
            ensure_packet=lambda *_a, **_k: self.packet,
            audit_path=lambda _slug, _ch, _vs, label: self.tmp / f"audit-{label}.json",
            polish_path=lambda *_a, **_k: self.tmp / "polish-sonnet5.json",
            lint_path=lambda *_a, **_k: self.tmp / "lint.json",
            draft_path=lambda *_a, **_k: self.tmp / "draft-auto.json",
            translation_path=lambda _slug: self.book,
            report_path=lambda _slug, _ch: self.tmp / "report.json",
            apply_names=lambda text: text,
        )
        self.patches.start()

    def tearDown(self) -> None:
        self.patches.stop()
        shutil.rmtree(self.tmp)

    def write_audit(self, label: str, spanish: str, verdict: str, findings: list) -> None:
        (self.tmp / f"audit-{label}.json").write_text(
            json.dumps(
                {
                    "verdict": verdict,
                    "spanish": spanish,
                    "findings": findings,
                    "notes": "",
                }
            ),
            encoding="utf-8",
        )

    def fail_finding(self) -> dict:
        return {
            "severity": "fail",
            "sourceTokenIds": [TOKEN],
            "issue": "comparison dropped",
            "spanishSpan": "mucho y recio",
        }

    def warn_finding(self) -> dict:
        return {
            "severity": "warn",
            "sourceTokenIds": [TOKEN],
            "issue": "copula added",
            "spanishSpan": "son",
        }

    def caller(self, model: str, request: Path) -> dict:
        self.calls.append(model)
        if model == auto_pass.sonnet_model():
            return {
                "spanish": NEW,
                "units": [{"es": NEW, "sourceTokenIds": [TOKEN]}],
                "grammarChanges": ["comparison restored"],
                "meaningChanges": [],
            }
        name = request.name
        if "polish" in name or "pulir" in name:
            return {"verdict": "pass", "findings": [], "notes": ""}
        return {"verdict": "pass", "findings": [], "notes": ""}

    def test_clean_pass_does_not_call_sonnet(self) -> None:
        self.write_audit("lbf", OLD, "pass", [])
        result = auto_pass.run_verse("exodo", 1, 9, caller=self.caller)
        self.assertEqual(result["status"], "kept")
        self.assertEqual(self.calls, [])
        self.assertIn(OLD, self.book.read_text(encoding="utf-8"))
        self.assertFalse((self.tmp / "polish-sonnet5.json").exists())

    def test_fail_is_repaired_when_reaudit_passes(self) -> None:
        self.write_audit("lbf", OLD, "fail", [self.fail_finding()])
        result = auto_pass.run_verse("exodo", 1, 9, caller=self.caller)
        self.assertEqual(result["status"], "repaired")
        self.assertTrue(result["applied"])
        self.assertEqual(
            self.calls,
            [auto_pass.sonnet_model(), auto_pass.auto_model(), auto_pass.auto_model()],
        )
        text = self.book.read_text(encoding="utf-8")
        self.assertIn(NEW, text)
        self.assertNotIn(OLD, text)
        self.assertIn("### 1:10", text)
        self.assertIn("Da, seamos sabios.", text)
        second = auto_pass.run_verse("exodo", 1, 9, caller=self.caller)
        self.assertEqual(second["status"], "kept")
        self.assertEqual(
            self.calls,
            [auto_pass.sonnet_model(), auto_pass.auto_model(), auto_pass.auto_model()],
        )

    def test_fail_stays_parked_when_reaudit_fails(self) -> None:
        self.write_audit("lbf", OLD, "fail", [self.fail_finding()])

        def caller(model: str, request: Path) -> dict:
            self.calls.append(model)
            if model == auto_pass.sonnet_model():
                return {
                    "spanish": NEW,
                    "units": [{"es": NEW, "sourceTokenIds": [TOKEN]}],
                    "grammarChanges": ["comparison restored"],
                    "meaningChanges": [],
                }
            return {
                "verdict": "fail",
                "findings": [self.fail_finding()],
                "notes": "still short",
            }

        result = auto_pass.run_verse("exodo", 1, 9, caller=caller)
        self.assertEqual(result["status"], "parked")
        self.assertIn(OLD, self.book.read_text(encoding="utf-8"))
        self.assertNotIn(NEW, self.book.read_text(encoding="utf-8"))
        again = auto_pass.run_verse("exodo", 1, 9, caller=caller)
        self.assertEqual(again["status"], "parked")
        self.assertEqual(self.calls, [auto_pass.sonnet_model(), auto_pass.auto_model()])

    def test_warn_calls_sonnet_once(self) -> None:
        self.write_audit("lbf", OLD, "pass", [self.warn_finding()])
        result = auto_pass.run_verse("exodo", 1, 9, caller=self.caller)
        self.assertEqual(result["status"], "repaired")
        self.assertEqual(self.calls[0], auto_pass.sonnet_model())
        self.assertIn(NEW, self.book.read_text(encoding="utf-8"))

    def test_lint_failure_after_sonnet_parks(self) -> None:
        self.write_audit("lbf", OLD, "fail", [self.fail_finding()])

        def caller(model: str, _request: Path) -> dict:
            self.calls.append(model)
            return {
                "spanish": "vosotros veréis",
                "units": [{"es": "vosotros", "sourceTokenIds": [TOKEN]}],
                "grammarChanges": [],
                "meaningChanges": [],
            }

        result = auto_pass.run_verse("exodo", 1, 9, caller=caller)
        self.assertEqual(result["status"], "parked")
        self.assertEqual(self.calls, [auto_pass.sonnet_model()])
        self.assertIn(OLD, self.book.read_text(encoding="utf-8"))

    def test_missing_spanish_is_drafted_then_kept_on_clean_audit(self) -> None:
        self.book.write_text("# Éxodo\n\n## Capítulo 1\n\n### 1:9\n\n", encoding="utf-8")

        def caller(model: str, _request: Path) -> dict:
            self.calls.append(model)
            if len(self.calls) == 1:
                return {
                    "spanish": NEW,
                    "units": [{"es": NEW, "sourceTokenIds": [TOKEN]}],
                    "uncertainties": [],
                    "addedConcepts": [],
                }
            return {"verdict": "pass", "findings": [], "notes": ""}

        result = auto_pass.run_verse("exodo", 1, 9, caller=caller)
        self.assertEqual(result["status"], "drafted")
        self.assertEqual(self.calls, [auto_pass.auto_model(), auto_pass.auto_model()])
        self.assertIn(NEW, self.book.read_text(encoding="utf-8"))
        self.assertFalse((self.tmp / "polish-sonnet5.json").exists())

    def test_chapter_report_and_missing_cli(self) -> None:
        self.write_audit("lbf", OLD, "pass", [])
        with patch("auto_pass.chapter_verses", return_value=[9]):
            summary = auto_pass.run_auto("exodo", 1, caller=self.caller)
        self.assertEqual(summary["kept"], [9])
        self.assertEqual(summary["parked"], [])
        report = json.loads((self.tmp / "report.json").read_text(encoding="utf-8"))
        self.assertEqual(report["schema"], "lbf-auto-pass-v1")
        with patch("auto_pass.agent_binary", return_value=None):
            self.assertEqual(auto_pass.main(["exodo", "1"]), 2)

    def test_supplied_copula_is_italic_and_not_parked(self) -> None:
        line = "Y estos son los nombres de los hijos de Israel."
        self.book.write_text(
            "# Éxodo\n\n## Capítulo 1\n\n### 1:9\n\n" + line + "\n",
            encoding="utf-8",
        )
        self.write_audit(
            "lbf",
            line,
            "pass",
            [
                {
                    "severity": "warn",
                    "sourceTokenIds": [TOKEN],
                    "issue": "Spanish adds the copula son",
                    "spanishSpan": "son",
                }
            ],
        )
        (self.tmp / "polish-sonnet5.json").write_text(
            json.dumps({"spanish": line, "sourceDraft": line, "readerNote": ""}),
            encoding="utf-8",
        )
        result = auto_pass.run_verse("exodo", 1, 9, caller=self.caller)
        self.assertEqual(result["status"], "repaired")
        self.assertEqual(self.calls, [])
        self.assertIn("*son*", self.book.read_text(encoding="utf-8"))
        self.assertIn("supplied", result["readerNote"])

    def test_reader_note_is_kept_when_sonnet_chooses(self) -> None:
        self.write_audit("lbf", OLD, "fail", [self.fail_finding()])

        def caller(model: str, request: Path) -> dict:
            self.calls.append(model)
            if model == auto_pass.sonnet_model():
                return {
                    "spanish": NEW,
                    "units": [{"es": NEW, "sourceTokenIds": [TOKEN]}],
                    "grammarChanges": ["number"],
                    "meaningChanges": [],
                    "readerNote": "The participle is plural; Spanish follows alma.",
                }
            return {"verdict": "pass", "findings": [], "notes": ""}

        result = auto_pass.run_verse("exodo", 1, 9, caller=caller)
        self.assertEqual(result["status"], "repaired")
        self.assertIn("alma", result["readerNote"])

    def test_clause_role_stays_on_hold_without_sonnet(self) -> None:
        self.write_audit(
            "lbf",
            OLD,
            "pass",
            [
                {
                    "severity": "warn",
                    "sourceTokenIds": [TOKEN],
                    "issue": "Pitom and Raamses read as parallel beneficiaries; את marks the cities",
                    "spanishSpan": "a Pitom",
                }
            ],
        )

        def caller(model: str, _request: Path) -> dict:
            self.calls.append(model)
            raise AssertionError(model)

        result = auto_pass.run_verse("exodo", 1, 9, caller=caller)
        self.assertEqual(result["status"], "parked")
        self.assertEqual(result["notes"], "clause role")
        self.assertIn(OLD, self.book.read_text(encoding="utf-8"))
        self.assertEqual(self.calls, [])

    def test_number_choice_is_sent_to_sonnet_again(self) -> None:
        self.write_audit(
            "lbf",
            OLD,
            "pass",
            [
                {
                    "severity": "warn",
                    "sourceTokenIds": [TOKEN],
                    "issue": "the participle is plural; Spanish singular salió agrees with alma",
                    "spanishSpan": "salió",
                }
            ],
        )
        (self.tmp / "polish-sonnet5.json").write_text(
            json.dumps({"spanish": OLD, "sourceDraft": OLD}),
            encoding="utf-8",
        )

        def caller(model: str, _request: Path) -> dict:
            self.calls.append(model)
            if model == auto_pass.sonnet_model():
                return {
                    "spanish": NEW,
                    "units": [{"es": NEW, "sourceTokenIds": [TOKEN]}],
                    "grammarChanges": ["number"],
                    "meaningChanges": [],
                    "readerNote": "Plural participle; Spanish follows alma.",
                }
            return {"verdict": "pass", "findings": [], "notes": ""}

        result = auto_pass.run_verse("exodo", 1, 9, caller=caller)
        self.assertEqual(result["status"], "repaired")
        self.assertEqual(self.calls[0], auto_pass.sonnet_model())
        self.assertIn(NEW, self.book.read_text(encoding="utf-8"))
        stored = json.loads((self.tmp / "polish-sonnet5.json").read_text(encoding="utf-8"))
        self.assertEqual(stored["policy"], auto_pass.SCOPE)

    def test_hold_note_does_not_replace_the_verse(self) -> None:
        self.write_audit("lbf", OLD, "fail", [self.fail_finding()])

        def caller(model: str, _request: Path) -> dict:
            self.calls.append(model)
            return {
                "spanish": NEW,
                "units": [{"es": NEW, "sourceTokenIds": [TOKEN]}],
                "grammarChanges": [],
                "meaningChanges": [],
                "readerNote": "hold: clause role. Pitom and Raamses are the cities.",
            }

        result = auto_pass.run_verse("exodo", 1, 9, caller=caller)
        self.assertEqual(result["status"], "parked")
        self.assertIn(OLD, self.book.read_text(encoding="utf-8"))
        self.assertNotIn(NEW, self.book.read_text(encoding="utf-8"))

    def test_archaic_word_after_sonnet_is_not_applied(self) -> None:
        bad = "Ea, seamos sabios a él."
        self.write_audit("lbf", OLD, "fail", [self.fail_finding()])

        def caller(model: str, request: Path) -> dict:
            self.calls.append((model, request.name))
            if model == auto_pass.sonnet_model():
                return {
                    "spanish": bad,
                    "units": [{"es": "Ea", "sourceTokenIds": [TOKEN]}],
                    "grammarChanges": [],
                    "meaningChanges": [],
                    "readerNote": "",
                }
            return {"verdict": "pass", "findings": [], "notes": ""}

        result = auto_pass.run_verse("exodo", 1, 9, caller=caller)
        self.assertEqual(result["status"], "parked")
        self.assertEqual(result["notes"], "spanish check")
        text = self.book.read_text(encoding="utf-8")
        self.assertIn(OLD, text)
        self.assertNotIn("Ea", text)
        self.assertNotIn("spanish-check.request", " ".join(name for _model, name in self.calls))

    def test_archaic_word_already_in_the_book_is_parked_not_rewritten(self) -> None:
        bad = "Ea, seamos sabios a él."
        self.book.write_text(
            "# Éxodo\n\n## Capítulo 1\n\n### 1:9\n\n" + bad + "\n",
            encoding="utf-8",
        )
        (self.tmp / "polish-sonnet5.json").write_text(
            json.dumps({"spanish": bad, "sourceDraft": OLD, "policy": auto_pass.SCOPE}),
            encoding="utf-8",
        )
        self.write_audit("pulir", bad, "pass", [])
        result = auto_pass.run_verse("exodo", 1, 9, caller=self.caller)
        self.assertEqual(result["status"], "parked")
        self.assertEqual(result["notes"], "spanish check")
        text = self.book.read_text(encoding="utf-8")
        self.assertIn(bad, text)
        self.assertNotIn(OLD, text)

    def test_agent_binary_missing(self) -> None:
        with patch.dict("os.environ", {"LBF_CURSOR_AGENT": ""}, clear=False):
            os_agent = __import__("os")
            os_agent.environ.pop("LBF_CURSOR_AGENT", None)
            with patch("auto_pass.shutil.which", return_value=None), patch(
                "auto_pass.Path.home", return_value=self.tmp
            ):
                self.assertIsNone(auto_pass.agent_binary())


if __name__ == "__main__":
    unittest.main()
