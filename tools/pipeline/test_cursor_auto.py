"""Cursor Auto drafts and audits. Sonnet runs only when a verse is questionable."""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cursor_auto

CLEAN = "Y dijo: Cuando asistan a las hebreas a dar a luz, y verán sobre las dos piedras."


class CursorAutoTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.packet = {
            "book": "exodo",
            "reference": "Éxodo 1:99",
            "chapter": 1,
            "verse": 99,
            "textualBasis": "OSHB/WLC",
            "tokens": [
                {"sourceTokenId": "h02001016007", "surface": "אבנים"},
                {"sourceTokenId": "h02001016016", "surface": "וחי"},
            ],
        }
        (self.tmp / "packet.json").write_text(
            json.dumps(self.packet), encoding="utf-8"
        )
        self.patches = patch.multiple(
            cursor_auto,
            packet_path=lambda *_a, **_k: self.tmp / "packet.json",
            draft_path=lambda *_a, **_k: self.tmp / "draft-auto.json",
            draft_request_path=lambda *_a, **_k: self.tmp / "draft-auto.request.json",
            audit_path=lambda _slug, _ch, _vs, label: self.tmp / f"audit-{label}.json",
            audit_request_path=lambda _slug, _ch, _vs, label: self.tmp / f"audit-{label}.request.json",
            polish_path=lambda *_a, **_k: self.tmp / "polish-sonnet5.json",
            polish_request_path=lambda *_a, **_k: self.tmp / "polish-sonnet5.request.json",
            lint_path=lambda *_a, **_k: self.tmp / "lint.json",
        )
        self.patches.start()

    def tearDown(self) -> None:
        self.patches.stop()
        shutil.rmtree(self.tmp)

    def write(self, name: str, payload: dict) -> None:
        (self.tmp / name).write_text(json.dumps(payload), encoding="utf-8")

    def test_missing_draft_asks_auto_not_gpt(self) -> None:
        result = cursor_auto.run_verse("exodo", 1, 99, resume=False)
        self.assertEqual(result["status"], "waiting")
        self.assertEqual(result["model"], "cursor-auto")
        self.assertEqual(result["stage"], "draft")
        request = json.loads((self.tmp / "draft-auto.request.json").read_text(encoding="utf-8"))
        self.assertEqual(request["model"], "cursor-auto")
        self.assertNotIn("gpt", request["model"])
        self.assertFalse((self.tmp / "polish-sonnet5.request.json").exists())

    def test_clean_auto_pass_skips_sonnet(self) -> None:
        self.write("draft-auto.json", {"spanish": CLEAN, "uncertainties": [], "addedConcepts": []})
        self.write(
            "audit-auto.json",
            {"verdict": "pass", "spanish": CLEAN, "findings": []},
        )
        result = cursor_auto.run_verse("exodo", 1, 99, resume=False)
        self.assertEqual(result["status"], "passed")
        self.assertEqual(result["stage"], "audit-draft")
        self.assertFalse((self.tmp / "polish-sonnet5.request.json").exists())

    def test_warn_asks_sonnet(self) -> None:
        self.write("draft-auto.json", {"spanish": CLEAN, "uncertainties": [], "addedConcepts": []})
        self.write(
            "audit-auto.json",
            {
                "verdict": "pass",
                "spanish": CLEAN,
                "findings": [
                    {
                        "severity": "warn",
                        "issue": "dual unmarked",
                        "sourceTokenIds": ["h02001016007"],
                    }
                ],
            },
        )
        result = cursor_auto.run_verse("exodo", 1, 99, resume=False)
        self.assertEqual(result["status"], "waiting")
        self.assertEqual(result["model"], "sonnet")
        self.assertEqual(result["stage"], "polish")

    def test_lint_asks_sonnet_without_auto_audit(self) -> None:
        self.write(
            "draft-auto.json",
            {"spanish": "Cuando vosotros veáis", "uncertainties": [], "addedConcepts": []},
        )
        result = cursor_auto.run_verse("exodo", 1, 99, resume=False)
        self.assertEqual(result["status"], "waiting")
        self.assertEqual(result["model"], "sonnet")
        self.assertFalse((self.tmp / "audit-auto.request.json").exists())

    def test_uncertainty_is_questionable_after_a_clean_audit(self) -> None:
        self.write(
            "draft-auto.json",
            {"spanish": CLEAN, "uncertainties": ["dual stones"], "addedConcepts": []},
        )
        self.write("audit-auto.json", {"verdict": "pass", "spanish": CLEAN, "findings": []})
        result = cursor_auto.run_verse("exodo", 1, 99, resume=False)
        self.assertEqual(result["model"], "sonnet")

    def test_reply_becomes_draft_then_auto_audits(self) -> None:
        self.write(
            "draft-auto.reply.json",
            {
                "spanish": CLEAN,
                "units": [{"es": "las dos piedras", "sourceTokenIds": ["h02001016007"]}],
                "uncertainties": [],
                "addedConcepts": [],
            },
        )
        result = cursor_auto.run_verse("exodo", 1, 99, resume=False)
        draft = json.loads((self.tmp / "draft-auto.json").read_text(encoding="utf-8"))
        self.assertEqual(draft["drafter"], "Cursor Auto")
        self.assertEqual(draft["spanish"], CLEAN)
        self.assertEqual(result["status"], "waiting")
        self.assertEqual(result["stage"], "audit-draft")
        self.assertEqual(result["model"], "cursor-auto")

    def test_sonnet_output_is_reaudited_by_auto(self) -> None:
        self.write("draft-auto.json", {"spanish": CLEAN, "uncertainties": [], "addedConcepts": []})
        self.write(
            "audit-auto.json",
            {
                "verdict": "pass",
                "spanish": CLEAN,
                "findings": [{"severity": "warn", "issue": "dual", "sourceTokenIds": ["h02001016007"]}],
            },
        )
        self.write("polish-sonnet5.json", {"spanish": CLEAN, "meaningChanges": []})
        result = cursor_auto.run_verse("exodo", 1, 99, resume=False)
        self.assertEqual(result["status"], "waiting")
        self.assertEqual(result["stage"], "audit-polish")
        self.assertEqual(result["model"], "cursor-auto")

        self.write("audit-pulir.json", {"verdict": "pass", "spanish": CLEAN, "findings": []})
        result = cursor_auto.run_verse("exodo", 1, 99, resume=False)
        self.assertEqual(result["status"], "passed")
        self.assertEqual(result["stage"], "audit-polish")

        self.write(
            "audit-pulir.json",
            {
                "verdict": "pass",
                "spanish": CLEAN,
                "findings": [
                    {"severity": "warn", "issue": "copula", "sourceTokenIds": ["h02001016007"]}
                ],
            },
        )
        result = cursor_auto.run_verse("exodo", 1, 99, resume=False)
        self.assertEqual(result["status"], "passed")


if __name__ == "__main__":
    unittest.main()
