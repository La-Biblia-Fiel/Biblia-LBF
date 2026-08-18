from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


class StatusReplacesGates(unittest.TestCase):
    def test_status_script_accepts_unsigned_drafts(self) -> None:
        result = subprocess.run(
            [sys.executable, str(REPO / "tools" / "status.py")],
            cwd=REPO,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("no stale done labels", result.stdout)

    def test_old_workflow_refuses_to_approve(self) -> None:
        result = subprocess.run(
            [sys.executable, str(SCRIPTS / "book_workflow.py")],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 2)
        self.assertIn("STATUS.md", result.stderr)


if __name__ == "__main__":
    unittest.main()
