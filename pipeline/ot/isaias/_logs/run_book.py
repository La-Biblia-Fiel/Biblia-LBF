#!/usr/bin/env python3
"""Run Isaiah chapters 2–66 via scripts only (economy polish=warn).

Resume-safe. Does not write translation/*.md or STATUS.md.
Agent is not invoked — holds stay parked for a later pass.
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]  # Biblia-LBF/
LOG_DIR = Path(__file__).resolve().parent
SUMMARY = LOG_DIR / "summary.jsonl"
LIVE = LOG_DIR / "run-ch2-66.log"


def main() -> int:
    print(f"start {datetime.now(timezone.utc).isoformat()}", flush=True)
    for ch in range(2, 67):
        print(f"=== chapter {ch} ===", flush=True)
        proc = subprocess.run(
            [sys.executable, str(ROOT / "tools/pipeline/run_chapter.py"), "isaias", str(ch)],
            cwd=str(ROOT),
        )
        qpath = ROOT / "pipeline" / "ot" / "isaias" / f"isaias-{ch}.queue.json"
        row: dict = {
            "chapter": ch,
            "exit": proc.returncode,
            "at": datetime.now(timezone.utc).isoformat(),
        }
        if qpath.is_file():
            queue = json.loads(qpath.read_text(encoding="utf-8"))
            row["passedCount"] = len(queue.get("passed") or [])
            row["holds"] = [h.get("verse") for h in (queue.get("holds") or [])]
            row["errors"] = [e.get("verse") for e in (queue.get("errors") or [])]
            row["usage"] = queue.get("usage") or {}
        with SUMMARY.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")
        print(json.dumps(row, ensure_ascii=False), flush=True)
        # Refresh parked-holds rollup after each chapter
        subprocess.run(
            [sys.executable, str(LOG_DIR / "roll_holds.py")],
            cwd=str(ROOT),
            check=False,
        )
        if proc.returncode != 0:
            print(f"chapter {ch} failed exit={proc.returncode}", flush=True)
    print(f"done {datetime.now(timezone.utc).isoformat()}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
