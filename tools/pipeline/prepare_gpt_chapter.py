#!/usr/bin/env python3
"""Prepare canonical one-verse GPT requests for an OT chapter; no model calls."""

from __future__ import annotations

import argparse
import json

from draft_lib import build_user_prompt, load_system, request_path, write_json
from source_packet import build_packet, list_verses, packet_path, write_packet
from books import get_book


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("book")
    parser.add_argument("chapter", type=int)
    parser.add_argument("--label", default="gpt-pilot")
    args = parser.parse_args()
    book = get_book(args.book)
    if book.testament != "ot":
        raise SystemExit("NT evidence remains blocked")
    system = load_system()
    rows = []
    for verse in list_verses(args.book, args.chapter):
        packet = build_packet(args.book, args.chapter, verse)
        stored = write_packet(packet)
        request = request_path(args.book, args.chapter, verse, args.label)
        write_json(
            request,
            {
                "system": system,
                "user": build_user_prompt(packet),
                "packetRef": str(stored),
            },
        )
        rows.append({"verse": verse, "packet": str(stored), "request": str(request)})
    print(json.dumps({"book": args.book, "chapter": args.chapter, "modelCalls": 0, "prepared": rows}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
