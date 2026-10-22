#!/usr/bin/env python3
"""Validate the canonical OT evidence pilot without calling a model."""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from books import ROOT
from source_packet import build_packet, list_verses, packet_for_prompt


STRESS_REFS = [
    ("genesis", 1, 1),
    ("genesis", 22, 2),
    ("exodo", 3, 14),
    ("levitico", 19, 18),
    ("numeros", 6, 24),
    ("deuteronomio", 6, 4),
    ("josue", 1, 8),
    ("jueces", 5, 2),
    ("rut", 1, 16),
    ("1samuel", 3, 10),
    ("2samuel", 7, 12),
    ("1reyes", 18, 21),
    ("job", 1, 1),
    ("job", 19, 25),
    ("salmos", 3, 1),
    ("salmos", 23, 1),
    ("salmos", 119, 105),
    ("proverbios", 1, 7),
    ("eclesiastes", 5, 1),
    ("cantares", 1, 2),
    ("isaias", 7, 14),
    ("isaias", 64, 1),
    ("jeremias", 31, 31),
    ("ezequiel", 37, 1),
    ("daniel", 2, 4),
    ("oseas", 11, 1),
    ("joel", 2, 28),
    ("miqueas", 6, 8),
]


def validate_refs(refs: list[tuple[str, int, int]]) -> dict:
    started = time.time()
    passed = []
    failed = []
    total_bytes = 0
    for slug, chapter, verse in refs:
        try:
            packet = packet_for_prompt(build_packet(slug, chapter, verse))
            size = len(json.dumps(packet, ensure_ascii=False, separators=(",", ":")).encode())
            total_bytes += size
            passed.append(
                {
                    "book": slug,
                    "chapter": chapter,
                    "verse": verse,
                    "tokens": len(packet["tokens"]),
                    "syntaxNodes": len(packet["syntax"]["nodes"]),
                    "lexicalEntries": len(packet["lexicalEvidence"]),
                    "corpusEntries": len(packet["corpusEvidence"]),
                    "promptPacketBytes": size,
                }
            )
        except Exception as exc:
            failed.append(
                {
                    "book": slug,
                    "chapter": chapter,
                    "verse": verse,
                    "error": f"{type(exc).__name__}: {exc}",
                }
            )
    return {
        "schema": "lbf-ot-evidence-validation-v1",
        "modelCalls": 0,
        "passed": passed,
        "failed": failed,
        "summary": {
            "requested": len(refs),
            "passed": len(passed),
            "failed": len(failed),
            "totalPromptPacketBytes": total_bytes,
            "elapsedSeconds": round(time.time() - started, 3),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--exodus-1", action="store_true", help="validate all 22 verses of Exodus 1")
    parser.add_argument("--stress", action="store_true", help="validate the fixed cross-genre stress set")
    parser.add_argument("--write", type=Path, help="optional JSON report path")
    args = parser.parse_args()
    refs = []
    if args.exodus_1:
        refs.extend(("exodo", 1, verse) for verse in list_verses("exodo", 1))
    if args.stress:
        refs.extend(STRESS_REFS)
    if not refs:
        parser.error("select --exodus-1, --stress, or both")
    refs = list(dict.fromkeys(refs))
    report = validate_refs(refs)
    rendered = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.write:
        path = args.write if args.write.is_absolute() else ROOT / args.write
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(rendered, encoding="utf-8")
    print(rendered, end="")
    return 1 if report["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
