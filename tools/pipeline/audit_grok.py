#!/usr/bin/env python3
"""Grok 4.6 source-fidelity audit for one verse.

Does not write translation markdown or STATUS.md.

    python3 tools/pipeline/audit_grok.py exodo 1 16 \\
        --spanish 'Y dijo: Cuando asistan…' --label grok-test

If no xAI key is set, writes a request file for a Cursor Grok 4.6 pass
(`--prompt-only` prints that path and exits 2).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from audit_lib import (
    SYSTEM,
    audit_path,
    build_user_prompt,
    call_xai,
    normalize_audit,
    request_path,
    write_json,
)
import env_load  # noqa: F401
from books import get_book
from source_packet import build_packet, packet_path, write_packet
from usage_lib import record_call


def load_spanish(args: argparse.Namespace) -> tuple[str, str]:
    if args.candidate_file:
        payload = json.loads(Path(args.candidate_file).read_text(encoding="utf-8"))
        if isinstance(payload, dict) and "spanish" in payload:
            return str(payload["spanish"]), str(payload.get("label") or args.label)
        raise SystemExit("--candidate-file must be JSON with a 'spanish' field")
    if args.spanish is None:
        raise SystemExit("pass --spanish or --candidate-file")
    return args.spanish, args.label


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("book")
    parser.add_argument("chapter", type=int)
    parser.add_argument("verse", type=int)
    parser.add_argument("--spanish", help="Candidate Spanish for this verse")
    parser.add_argument("--candidate-file", help="JSON {spanish, label?}")
    parser.add_argument("--label", default="candidate")
    parser.add_argument(
        "--prompt-only",
        action="store_true",
        help="Write the Grok request; do not call an API",
    )
    parser.add_argument(
        "--ingest",
        help="Normalize a Cursor Grok JSON response (file path) instead of calling xAI",
    )
    args = parser.parse_args()

    spanish, label = load_spanish(args)
    book = get_book(args.book)
    stored = packet_path(book, args.chapter, args.verse)
    if stored.is_file():
        packet = json.loads(stored.read_text(encoding="utf-8"))
    else:
        packet = build_packet(args.book, args.chapter, args.verse)
        stored = write_packet(packet)

    user_prompt = build_user_prompt(packet, spanish, label)
    req_file = request_path(args.book, args.chapter, args.verse, label)
    write_json(
        req_file,
        {"system": SYSTEM, "user": user_prompt, "packetRef": str(stored)},
    )

    out = audit_path(args.book, args.chapter, args.verse, label)

    if args.prompt_only:
        print(f"wrote Grok request {req_file}")
        return 0

    if args.ingest:
        ingest_path = Path(args.ingest)
        if not ingest_path.is_file():
            print(
                f"--ingest file not found: {ingest_path}\n"
                "That path is only for a JSON reply you saved from Cursor Grok.\n"
                "Without XAI_API_KEY, omit --ingest. If a matching audit is already "
                f"on disk it will be reused:\n  {out}",
                file=sys.stderr,
            )
            if out.is_file():
                existing = json.loads(out.read_text(encoding="utf-8"))
                if existing.get("spanish") == spanish:
                    print(
                        f"Cursor Grok audit already on disk: {existing['verdict']}  {out}  "
                        f"findings={len(existing.get('findings') or [])}",
                        file=sys.stderr,
                    )
                    return 0 if existing.get("verdict") == "pass" else 1
            return 2
        raw = json.loads(ingest_path.read_text(encoding="utf-8"))
        audit = normalize_audit(raw, packet, spanish, label)
        write_json(out, audit)
        print(f"{audit['verdict']}  {out}  findings={len(audit['findings'])}")
        return 0 if audit["verdict"] == "pass" else 1

    try:
        raw, usage = call_xai(SYSTEM, user_prompt)
        record_call(args.book, args.chapter, args.verse, "audit-draft", usage)
    except RuntimeError as exc:
        print(f"API unavailable ({exc}). Request saved at {req_file}", file=sys.stderr)
        if out.is_file():
            existing = json.loads(out.read_text(encoding="utf-8"))
            if existing.get("spanish") == spanish:
                print(
                    f"Cursor Grok audit already on disk: {existing['verdict']}  {out}  "
                    f"findings={len(existing.get('findings') or [])}",
                    file=sys.stderr,
                )
                return 0 if existing.get("verdict") == "pass" else 1
        print("Ask Cursor Grok 4.6 to audit the request JSON, then --ingest the response.", file=sys.stderr)
        return 2

    audit = normalize_audit(raw, packet, spanish, label)
    write_json(out, audit)
    print(f"{audit['verdict']}  {out}  findings={len(audit['findings'])}")
    return 0 if audit["verdict"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
