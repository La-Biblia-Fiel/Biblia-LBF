#!/usr/bin/env python3
"""Pulir: Claude Sonnet 5 grammar polish for one Grok-passed verse.

Does not write translation markdown or STATUS.md.

    python3 tools/pipeline/polish_sonnet.py exodo 1 16
    python3 tools/pipeline/polish_sonnet.py exodo 1 16 --prompt-only

Refuses if the GPT draft has no Grok audit with verdict pass.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from audit_lib import audit_path
import env_load  # noqa: F401
from books import get_book
from draft_lib import draft_path
from polish_lib import (
    build_user_prompt,
    call_sonnet,
    load_system,
    normalize_polish,
    polish_path,
    request_path,
    write_json,
)
from source_packet import build_packet, packet_path, write_packet
from usage_lib import record_call


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("book")
    parser.add_argument("chapter", type=int)
    parser.add_argument("verse", type=int)
    parser.add_argument("--draft-label", default="gpt56")
    parser.add_argument("--label", default="sonnet5")
    parser.add_argument("--prompt-only", action="store_true")
    parser.add_argument("--ingest", help="JSON reply saved from Cursor Sonnet")
    args = parser.parse_args()

    book = get_book(args.book)
    stored = packet_path(book, args.chapter, args.verse)
    if stored.is_file():
        packet = json.loads(stored.read_text(encoding="utf-8"))
    else:
        packet = build_packet(args.book, args.chapter, args.verse)
        stored = write_packet(packet)

    draft_file = draft_path(args.book, args.chapter, args.verse, args.draft_label)
    if not draft_file.is_file():
        print(f"no GPT draft at {draft_file}", file=sys.stderr)
        return 2
    draft = json.loads(draft_file.read_text(encoding="utf-8"))

    grok_file = audit_path(args.book, args.chapter, args.verse, args.draft_label)
    if not grok_file.is_file():
        print(f"no Grok audit at {grok_file}. Run audit_grok.py first.", file=sys.stderr)
        return 2
    audit = json.loads(grok_file.read_text(encoding="utf-8"))
    if audit.get("verdict") != "pass":
        print(
            f"Grok verdict is {audit.get('verdict')!r}. Pulir refuses. "
            "Traduce must repair fails first.",
            file=sys.stderr,
        )
        return 2
    if audit.get("spanish") != draft.get("spanish"):
        print("Grok audit Spanish does not match the GPT draft. Re-audit.", file=sys.stderr)
        return 2

    system = load_system()
    user_prompt = build_user_prompt(packet, draft, audit)
    req_file = request_path(args.book, args.chapter, args.verse, args.label)
    write_json(req_file, {"system": system, "user": user_prompt, "packetRef": str(stored)})
    out = polish_path(args.book, args.chapter, args.verse, args.label)

    if args.prompt_only:
        print(f"wrote Sonnet request {req_file}")
        return 0

    if args.ingest:
        ingest_path = Path(args.ingest)
        if not ingest_path.is_file():
            print(f"--ingest file not found: {ingest_path}", file=sys.stderr)
            return 2
        raw = json.loads(ingest_path.read_text(encoding="utf-8"))
        polish = normalize_polish(raw, packet, draft, args.label)
        write_json(out, polish)
        print(f"polish  {out}")
        print(polish["spanish"])
        return 0 if not polish["meaningChanges"] else 1

    try:
        raw, usage = call_sonnet(system, user_prompt)
        record_call(args.book, args.chapter, args.verse, "polish", usage)
    except RuntimeError as exc:
        print(f"API unavailable ({exc}). Request saved at {req_file}", file=sys.stderr)
        if out.is_file():
            existing = json.loads(out.read_text(encoding="utf-8"))
            print(f"Cursor Sonnet polish already on disk: {out}", file=sys.stderr)
            print(existing.get("spanish") or "", file=sys.stderr)
            return 0
        print("Invoke Pulir so Claude Sonnet 5 takes over.", file=sys.stderr)
        return 2

    polish = normalize_polish(raw, packet, draft, args.label)
    write_json(out, polish)
    print(f"polish  {out}")
    print(polish["spanish"])
    if polish["meaningChanges"]:
        print("meaningChanges must be empty", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
