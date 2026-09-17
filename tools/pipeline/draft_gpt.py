#!/usr/bin/env python3
"""Traduce: GPT-5.6 source-faithful draft for one verse.

Does not write translation markdown or STATUS.md.

    python3 tools/pipeline/draft_gpt.py exodo 1 16
    python3 tools/pipeline/draft_gpt.py exodo 1 16 --prompt-only
    python3 tools/pipeline/draft_gpt.py exodo 1 16 --ingest gpt-response.json

Without OPENAI_API_KEY, writes a Cursor GPT request. Reuses a matching
on-disk draft if one exists. Then run audit_grok.py on that Spanish.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import env_load  # noqa: F401
from books import get_book
from draft_lib import (
    build_user_prompt,
    call_openai,
    draft_path,
    load_system,
    normalize_draft,
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
    parser.add_argument("--label", default="gpt56")
    parser.add_argument("--prompt-only", action="store_true")
    parser.add_argument("--ingest", help="JSON reply saved from Cursor GPT")
    args = parser.parse_args()

    book = get_book(args.book)
    stored = packet_path(book, args.chapter, args.verse)
    if stored.is_file():
        packet = json.loads(stored.read_text(encoding="utf-8"))
    else:
        packet = build_packet(args.book, args.chapter, args.verse)
        stored = write_packet(packet)

    system = load_system()
    user_prompt = build_user_prompt(packet)
    req_file = request_path(args.book, args.chapter, args.verse, args.label)
    write_json(req_file, {"system": system, "user": user_prompt, "packetRef": str(stored)})
    out = draft_path(args.book, args.chapter, args.verse, args.label)

    if args.prompt_only:
        print(f"wrote GPT request {req_file}")
        return 0

    if args.ingest:
        ingest_path = Path(args.ingest)
        if not ingest_path.is_file():
            print(f"--ingest file not found: {ingest_path}", file=sys.stderr)
            return 2
        raw = json.loads(ingest_path.read_text(encoding="utf-8"))
        draft = normalize_draft(raw, packet, args.label)
        write_json(out, draft)
        print(f"draft  {out}")
        print(draft["spanish"])
        return 0

    try:
        raw, usage = call_openai(system, user_prompt)
        record_call(args.book, args.chapter, args.verse, "draft", usage)
    except RuntimeError as exc:
        print(f"API unavailable ({exc}). Request saved at {req_file}", file=sys.stderr)
        if out.is_file():
            existing = json.loads(out.read_text(encoding="utf-8"))
            print(
                f"Cursor GPT draft already on disk: {out}",
                file=sys.stderr,
            )
            print(existing.get("spanish") or "", file=sys.stderr)
            return 0
        print("Ask Cursor Traduce (GPT-5.6) to draft from the request JSON.", file=sys.stderr)
        return 2

    draft = normalize_draft(raw, packet, args.label)
    write_json(out, draft)
    print(f"draft  {out}")
    print(draft["spanish"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
