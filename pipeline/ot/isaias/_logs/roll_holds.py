#!/usr/bin/env python3
"""Roll up parked holds from isaias-*.queue.json (scripts-only run)."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(__file__).resolve().parent / "parked-holds.json"


def main() -> int:
    holds: list[dict] = []
    passed = errors = chapters = 0
    for ch in range(1, 67):
        path = ROOT / f"isaias-{ch}.queue.json"
        if not path.is_file():
            continue
        chapters += 1
        queue = json.loads(path.read_text(encoding="utf-8"))
        passed += len(queue.get("passed") or [])
        errors += len(queue.get("errors") or [])
        for item in queue.get("holds") or []:
            holds.append(
                {
                    "ref": f"{ch}:{item.get('verse')}",
                    "chapter": ch,
                    "verse": item.get("verse"),
                    "stage": item.get("stage"),
                    "verdict": item.get("verdict"),
                    "spanish": item.get("spanish") or "",
                    "notes": item.get("notes") or "",
                    "findings": item.get("findings") or [],
                }
            )
    payload = {
        "book": "isaias",
        "mode": "scripts-only; agent reserved for parked holds",
        "chaptersWithQueues": chapters,
        "passedVerses": passed,
        "errorVerses": errors,
        "holdCount": len(holds),
        "holds": holds,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"chapters={chapters}/66 passed={passed} holds={len(holds)} errors={errors}")
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
