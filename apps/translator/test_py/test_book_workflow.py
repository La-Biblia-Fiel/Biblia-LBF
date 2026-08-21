from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]


class CanonicalBookWorkflow(unittest.TestCase):
    def test_status_script_can_check_one_book_without_unrelated_blockers(self) -> None:
        result = subprocess.run(
            [sys.executable, str(REPO / "tools" / "status.py"), "titus"],
            cwd=REPO,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("no stale ready/done labels", result.stdout)

    def test_status_script_refuses_an_unknown_book(self) -> None:
        result = subprocess.run(
            [sys.executable, str(REPO / "tools" / "status.py"), "not-a-book"],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 2)
        self.assertIn("not-a-book is not in STATUS.md", result.stderr)


if __name__ == "__main__":
    unittest.main()
