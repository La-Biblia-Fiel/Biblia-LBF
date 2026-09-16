import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from tools import status


class PhraseAlignmentStatusTests(unittest.TestCase):
    def write_book(self, root: Path, final_surface: str = "Dios", link_status: str = "hand") -> None:
        translation_dir = root / "translation" / "nt"
        alignment_dir = root / "alignment" / "nt" / "sample"
        translation_dir.mkdir(parents=True)
        alignment_dir.mkdir(parents=True)
        (translation_dir / "sample.md").write_text(
            "# Sample\n\n## Capítulo 1\n\n### 1:1\n\nEn el principio, creó Dios.\n",
            encoding="utf-8",
        )
        links = {
            "links": [
                {
                    "phraseIndex": 0,
                    "reference": "Sample 1:1",
                    "status": link_status,
                    "units": [
                        {"surface": "En", "sourceTokenIds": ["t1"], "method": "hand"},
                        {"surface": "el principio", "sourceTokenIds": ["t2"], "method": "hand"},
                    ],
                },
                {
                    "phraseIndex": 1,
                    "reference": "Sample 1:1",
                    "status": link_status,
                    "units": [
                        {"surface": "creó", "sourceTokenIds": ["t3"], "method": "hand"},
                        {"surface": final_surface, "sourceTokenIds": ["t4"], "method": "hand"},
                    ],
                },
            ]
        }
        (alignment_dir / "sample-reverse-links.json").write_text(
            json.dumps(links, ensure_ascii=False),
            encoding="utf-8",
        )

    def test_multiple_phrases_reconstruct_one_verse(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write_book(root)
            with patch.object(status, "ROOT", root):
                self.assertEqual(status.alignment_errors("sample", "nt", 1), [])

    def test_complete_verse_mismatch_is_still_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write_book(root, final_surface="Señor")
            with patch.object(status, "ROOT", root):
                self.assertEqual(
                    status.alignment_errors("sample", "nt", 1),
                    ["sample 1:1: units do not reconstruct Spanish"],
                )

    def test_seeded_hand_units_are_not_map_accepted(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write_book(root, link_status="seeded-hand")
            with patch.object(status, "ROOT", root):
                self.assertEqual(
                    status.alignment_errors("sample", "nt", 1),
                    [
                        "sample: alignment still has auto=0 gloss=0 unwalked=0 "
                        "unconfirmed=2 other=0",
                        "sample: alignment has no finished map units",
                    ],
                )

    def test_mapped_status_passes_when_spanish_reconstructs(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write_book(root, link_status="mapped")
            audit = {
                "bookId": "sample",
                "verdict": "pass",
                "summary": {"pass": 2, "warn": 0, "fail": 0, "error": 0},
                "phrases": [
                    {"phraseIndex": 0, "verdict": "pass", "issues": []},
                    {"phraseIndex": 1, "verdict": "pass", "issues": []},
                ],
            }
            (root / "alignment" / "nt" / "sample" / "sample-ai-alignment-audit.json").write_text(
                json.dumps(audit),
                encoding="utf-8",
            )
            with patch.object(status, "ROOT", root):
                self.assertEqual(status.alignment_errors("sample", "nt", 1), [])

    def test_mapped_without_ai_audit_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.write_book(root, link_status="mapped")
            with patch.object(status, "ROOT", root):
                errors = status.alignment_errors("sample", "nt", 1)
                self.assertTrue(any("AI alignment audit" in err for err in errors))


if __name__ == "__main__":
    unittest.main()
