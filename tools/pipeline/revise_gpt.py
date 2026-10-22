#!/usr/bin/env python3
"""Revise one GPT candidate only against cited gate findings.

The repair receives the canonical packet, candidate, and findings. It never
reads canonical LBF Spanish and never writes translation, alignment, or status.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import env_load  # noqa: F401
from books import get_book
from draft_lib import call_openai, draft_path, load_system, normalize_draft, write_json
from source_packet import dump_prompt, packet_for_prompt, packet_path
from usage_lib import record_call

REPAIR_RULES = """
This is a bounded repair, not a fresh interpretation. Correct every supplied
finding with the smallest change possible. Do not introduce a meaning that is
not licensed by the packet. Preserve unresolved uncertainties. Return the same
JSON shape required of a draft, with every Spanish unit citing sourceTokenIds.
""".strip()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("book")
    parser.add_argument("chapter", type=int)
    parser.add_argument("verse", type=int)
    parser.add_argument("--candidate-file", required=True)
    parser.add_argument("--findings-file", action="append", required=True)
    parser.add_argument("--label", default="gpt-repair")
    args = parser.parse_args()

    candidate = json.loads(Path(args.candidate_file).read_text(encoding="utf-8"))
    findings = [json.loads(Path(p).read_text(encoding="utf-8")) for p in args.findings_file]
    stored = packet_path(get_book(args.book), args.chapter, args.verse)
    if not stored.is_file():
        raise SystemExit(f"canonical packet not found: {stored}")
    packet = json.loads(stored.read_text(encoding="utf-8"))
    payload = {
        "task": "bounded-repair",
        "candidate": candidate,
        "gateFindings": findings,
        "packet": packet_for_prompt(packet),
    }
    system = load_system() + "\n\n" + REPAIR_RULES
    user = "Repair only the cited problems. JSON only.\n\n" + dump_prompt(payload)
    request = draft_path(args.book, args.chapter, args.verse, args.label).with_suffix(".request.json")
    write_json(request, {
        "system": system,
        "user": user,
        "packetRef": str(stored),
        "candidateRef": args.candidate_file,
        "findingsRefs": args.findings_file,
    })
    raw, usage = call_openai(system, user)
    record_call(args.book, args.chapter, args.verse, "repair-gpt", usage)
    repaired = normalize_draft(raw, packet, args.label)
    out = draft_path(args.book, args.chapter, args.verse, args.label)
    write_json(out, repaired)
    print(f"repair  {out}")
    print(repaired["spanish"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
