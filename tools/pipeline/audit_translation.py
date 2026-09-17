#!/usr/bin/env python3
"""Audit Spanish already in translation/*.md against source packets.

Never writes translation/*.md or STATUS.md.

Default is Cursor Auto (no xAI bill): write request JSON, then ingest replies.

    # Prepare a chapter for Cursor Auto (no API)
    python3 tools/pipeline/audit_translation.py genesis 1 --cursor

    # After Auto saves *.audit-lbf.reply.json next to each request:
    python3 tools/pipeline/audit_translation.py genesis 1 --ingest-replies

    # Paid xAI path (opt-in)
    python3 tools/pipeline/audit_translation.py genesis 1 --xai

    python3 tools/pipeline/audit_translation.py genesis --all --cursor
    python3 tools/pipeline/audit_translation.py exodo 1 --cursor --lint
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import env_load  # noqa: F401
from audit_lib import (
    SYSTEM,
    audit_path,
    build_user_prompt,
    call_xai,
    normalize_audit,
    request_path,
    write_json,
)
from books import ROOT, get_book
from lint_lib import lint_path, lint_spanish
from source_packet import build_packet, packet_path, write_packet
from usage_lib import record_call

VERSE_HEADING = re.compile(r"^###\s+(\d+):(\d+)\s*$")
LABEL = "lbf"


def parse_translation(slug: str) -> dict[tuple[int, int], str]:
    book = get_book(slug)
    path = ROOT / "translation" / book.testament / f"{book.slug}.md"
    if not path.is_file():
        raise SystemExit(f"missing translation file: {path}")
    verses: dict[tuple[int, int], str] = {}
    cur: tuple[int, int] | None = None
    buf: list[str] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        match = VERSE_HEADING.match(line)
        if match:
            if cur is not None:
                verses[cur] = " ".join(buf).strip()
            cur = (int(match.group(1)), int(match.group(2)))
            buf = []
            continue
        if cur is not None and line.strip() and not line.startswith("#") and not line.startswith(">"):
            buf.append(line.strip())
    if cur is not None:
        verses[cur] = " ".join(buf).strip()
    return verses


def load_or_build_packet(slug: str, chapter: int, verse: int) -> dict:
    book = get_book(slug)
    stored = packet_path(book, chapter, verse)
    if stored.is_file():
        return json.loads(stored.read_text(encoding="utf-8"))
    packet = build_packet(slug, chapter, verse)
    write_packet(packet)
    return packet


def reply_path(slug: str, chapter: int, verse: int) -> Path:
    req = request_path(slug, chapter, verse, LABEL)
    return req.with_name(req.name.replace(".request.json", ".reply.json"))


def queue_path(slug: str, chapter: int | None) -> Path:
    book = get_book(slug)
    name = f"{book.slug}-all.audit-{LABEL}.queue.json" if chapter is None else f"{book.slug}-{chapter}.audit-{LABEL}.queue.json"
    return ROOT / "pipeline" / book.testament / book.slug / name


def write_request(slug: str, chapter: int, verse: int, spanish: str, packet: dict) -> Path:
    book = get_book(slug)
    stored = packet_path(book, chapter, verse)
    user_prompt = build_user_prompt(packet, spanish, LABEL)
    req_file = request_path(slug, chapter, verse, LABEL)
    write_json(
        req_file,
        {
            "system": SYSTEM,
            "user": user_prompt,
            "packetRef": str(stored),
            "auditor": "cursor-auto",
            "book": slug,
            "chapter": chapter,
            "verse": verse,
            "spanish": spanish,
            "replyPath": str(reply_path(slug, chapter, verse)),
            "outputContract": {
                "verdict": "pass | fail",
                "findings": [
                    {
                        "severity": "fail | warn",
                        "sourceTokenIds": ["from packet only"],
                        "issue": "short description",
                        "spanishSpan": "words in question or empty",
                    }
                ],
                "notes": "optional one line",
            },
        },
    )
    return req_file


def existing_match(out: Path, spanish: str) -> dict | None:
    if not out.is_file():
        return None
    existing = json.loads(out.read_text(encoding="utf-8"))
    if existing.get("spanish") == spanish:
        return existing
    return None


def lint_hold(slug: str, chapter: int, verse: int, spanish: str) -> dict | None:
    lint_hits = lint_spanish(spanish)
    write_json(
        lint_path(slug, chapter, verse),
        {
            "book": slug,
            "chapter": chapter,
            "verse": verse,
            "spanish": spanish,
            "findings": lint_hits,
            "verdict": "fail" if lint_hits else "pass",
        },
    )
    if not lint_hits:
        return None
    audit = {
        "schema": "lbf-grok-audit-v1",
        "auditor": "local-lint",
        "book": slug,
        "reference": f"{get_book(slug).title} {chapter}:{verse}",
        "chapter": chapter,
        "verse": verse,
        "candidateLabel": LABEL,
        "spanish": spanish,
        "verdict": "fail",
        "findings": lint_hits,
        "notes": "parked by local lint; Cursor/xAI not called",
        "discardedUncitedFindings": 0,
    }
    write_json(audit_path(slug, chapter, verse, LABEL), audit)
    return {
        "verse": f"{chapter}:{verse}",
        "status": "lint-fail",
        "verdict": "fail",
        "findings": len(lint_hits),
        "path": str(audit_path(slug, chapter, verse, LABEL)),
        "issues": [item["issue"] for item in lint_hits],
    }


def prepare_cursor(
    slug: str, chapter: int, verse: int, spanish: str, *, resume: bool, use_lint: bool
) -> dict:
    out = audit_path(slug, chapter, verse, LABEL)
    matched = existing_match(out, spanish) if resume else None
    if matched:
        return {
            "verse": f"{chapter}:{verse}",
            "status": "skipped",
            "verdict": matched.get("verdict"),
            "findings": len(matched.get("findings") or []),
            "path": str(out),
        }
    if use_lint:
        held = lint_hold(slug, chapter, verse, spanish)
        if held:
            return held
    packet = load_or_build_packet(slug, chapter, verse)
    req_file = write_request(slug, chapter, verse, spanish, packet)
    return {
        "verse": f"{chapter}:{verse}",
        "status": "request",
        "verdict": None,
        "findings": 0,
        "path": str(req_file),
        "replyPath": str(reply_path(slug, chapter, verse)),
    }


def ingest_one(slug: str, chapter: int, verse: int, spanish: str, *, resume: bool) -> dict:
    out = audit_path(slug, chapter, verse, LABEL)
    matched = existing_match(out, spanish) if resume else None
    if matched:
        return {
            "verse": f"{chapter}:{verse}",
            "status": "skipped",
            "verdict": matched.get("verdict"),
            "findings": len(matched.get("findings") or []),
            "path": str(out),
        }
    reply = reply_path(slug, chapter, verse)
    if not reply.is_file():
        return {
            "verse": f"{chapter}:{verse}",
            "status": "waiting",
            "verdict": None,
            "findings": 0,
            "path": str(reply),
        }
    packet = load_or_build_packet(slug, chapter, verse)
    raw = json.loads(reply.read_text(encoding="utf-8"))
    if isinstance(raw, dict) and "verdict" not in raw and isinstance(raw.get("audit"), dict):
        raw = raw["audit"]
    audit = normalize_audit(raw, packet, spanish, LABEL)
    audit["auditor"] = str(raw.get("auditor") or "Cursor Auto")
    write_json(out, audit)
    return {
        "verse": f"{chapter}:{verse}",
        "status": "ingested",
        "verdict": audit["verdict"],
        "findings": len(audit["findings"]),
        "path": str(out),
        "issues": [item["issue"] for item in audit["findings"] if item["severity"] == "fail"],
    }


def audit_xai(
    slug: str, chapter: int, verse: int, spanish: str, *, resume: bool, use_lint: bool
) -> dict:
    out = audit_path(slug, chapter, verse, LABEL)
    matched = existing_match(out, spanish) if resume else None
    if matched:
        return {
            "verse": f"{chapter}:{verse}",
            "status": "skipped",
            "verdict": matched.get("verdict"),
            "findings": len(matched.get("findings") or []),
            "path": str(out),
        }
    if use_lint:
        held = lint_hold(slug, chapter, verse, spanish)
        if held:
            return held
    packet = load_or_build_packet(slug, chapter, verse)
    write_request(slug, chapter, verse, spanish, packet)
    raw, usage = call_xai(SYSTEM, build_user_prompt(packet, spanish, LABEL))
    record_call(slug, chapter, verse, "audit-lbf", usage)
    audit = normalize_audit(raw, packet, spanish, LABEL)
    write_json(out, audit)
    return {
        "verse": f"{chapter}:{verse}",
        "status": "audited",
        "verdict": audit["verdict"],
        "findings": len(audit["findings"]),
        "path": str(out),
        "issues": [item["issue"] for item in audit["findings"] if item["severity"] == "fail"],
    }


def tally(summary: dict, result: dict) -> None:
    status = result["status"]
    if status == "skipped":
        summary["skipped"] += 1
    elif status == "request":
        summary["requests"] += 1
    elif status == "waiting":
        summary["waiting"] += 1
    elif status in {"audited", "ingested"}:
        pass
    elif status == "lint-fail":
        pass
    if result.get("verdict") == "pass":
        summary["pass"] += 1
    elif result.get("verdict") == "fail":
        summary["fail"] += 1
        summary["fails"].append(result["verse"])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("book")
    parser.add_argument("chapter", type=int, nargs="?", default=None)
    parser.add_argument("--from", dest="start", type=int, default=1)
    parser.add_argument("--to", dest="end", type=int, default=None)
    parser.add_argument("--all", action="store_true", help="Every verse in the book")
    parser.add_argument("--no-resume", action="store_true")
    parser.add_argument(
        "--lint",
        action="store_true",
        help="Park local anti-examples before audit. Off by default.",
    )
    parser.add_argument(
        "--mode",
        choices=("cursor", "ingest", "xai"),
        default="cursor",
        help="cursor=write Auto requests (default, no xAI); ingest=load *.reply.json; xai=paid API",
    )
    # Back-compat flags
    parser.add_argument("--cursor", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--ingest-replies", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--xai", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()

    if not args.all and args.chapter is None:
        raise SystemExit("pass a chapter, or --all")

    if args.xai:
        mode = "xai"
    elif args.ingest_replies:
        mode = "ingest"
    elif args.cursor:
        mode = "cursor"
    else:
        mode = args.mode

    use_xai = mode == "xai"
    use_ingest = mode == "ingest"
    use_cursor = mode == "cursor"

    verses = parse_translation(args.book)
    if args.all:
        targets = sorted(verses)
        queue_chapter = None
    else:
        end = args.end
        targets = [
            (ch, vs)
            for (ch, vs) in sorted(verses)
            if ch == args.chapter and vs >= args.start and (end is None or vs <= end)
        ]
        queue_chapter = args.chapter
    if not targets:
        raise SystemExit("no verses matched")

    summary = {
        "mode": "xai" if use_xai else "ingest" if use_ingest else "cursor",
        "pass": 0,
        "fail": 0,
        "skipped": 0,
        "requests": 0,
        "waiting": 0,
        "errors": 0,
        "fails": [],
        "queue": None,
    }
    pending = []

    for chapter, verse in targets:
        spanish = verses.get((chapter, verse), "").strip()
        if not spanish:
            print(f"{chapter}:{verse}: error empty Spanish", flush=True)
            summary["errors"] += 1
            continue
        try:
            if use_xai:
                result = audit_xai(
                    args.book,
                    chapter,
                    verse,
                    spanish,
                    resume=not args.no_resume,
                    use_lint=args.lint,
                )
            elif use_ingest:
                result = ingest_one(
                    args.book, chapter, verse, spanish, resume=not args.no_resume
                )
            else:
                result = prepare_cursor(
                    args.book,
                    chapter,
                    verse,
                    spanish,
                    resume=not args.no_resume,
                    use_lint=args.lint,
                )
        except Exception as exc:  # noqa: BLE001
            print(f"{chapter}:{verse}: error {exc}", flush=True)
            summary["errors"] += 1
            continue

        print(
            f"{result['verse']}: {result['status']} {result.get('verdict')} "
            f"findings={result.get('findings')}",
            flush=True,
        )
        if result.get("issues"):
            print(f"  issues: {'; '.join(result['issues'])}", flush=True)
        tally(summary, result)
        if result["status"] == "request":
            pending.append(
                {
                    "verse": result["verse"],
                    "request": result["path"],
                    "reply": result.get("replyPath"),
                }
            )

    if use_cursor:
        qpath = queue_path(args.book, queue_chapter)
        write_json(
            qpath,
            {
                "book": args.book,
                "chapter": queue_chapter,
                "label": LABEL,
                "auditor": "cursor-auto",
                "instruction": (
                    "For each pending item: read the request JSON, follow system+user, "
                    "return only the audit JSON object, write it to reply path. "
                    "Cite sourceTokenIds from the packet or the finding is discarded. "
                    "Do not rewrite Spanish. Do not write translation/*.md or STATUS.md."
                ),
                "pending": pending,
                "pendingCount": len(pending),
            },
        )
        summary["queue"] = str(qpath)
        print(f"queue: {qpath} ({len(pending)} pending)", flush=True)

    print(json.dumps(summary, ensure_ascii=False), flush=True)
    return 0 if summary["errors"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
