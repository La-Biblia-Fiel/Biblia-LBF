#!/usr/bin/env python3
"""Write one verse's allowed source packet. Never writes Spanish or STATUS.md.

    python3 tools/pipeline/build_source_packet.py exodo 1 16
    python3 tools/pipeline/build_source_packet.py titus 1 1
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from source_packet import build_packet, write_packet


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("book", help="Book slug, e.g. exodo")
    parser.add_argument("chapter", type=int)
    parser.add_argument("verse", type=int)
    parser.add_argument(
        "--stdout",
        action="store_true",
        help="Print JSON instead of writing pipeline/",
    )
    args = parser.parse_args()
    packet = build_packet(args.book, args.chapter, args.verse)
    if args.stdout:
        json.dump(packet, sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
        return 0
    path = write_packet(packet)
    print(f"wrote {path} ({len(packet['tokens'])} tokens)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
