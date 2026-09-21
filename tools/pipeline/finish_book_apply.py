#!/usr/bin/env python3
"""When a book's chapter queues are complete: retry errors, apply passes, roll holds.

Does not call Agent. Does not write STATUS.md.

    python3 tools/pipeline/finish_book_apply.py jeremias
    python3 tools/pipeline/finish_book_apply.py jeremias --watch
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
import importlib.util
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from books import ROOT, get_book
from draft_lib import draft_path
from polish_lib import polish_path
from source_packet import list_verses

VERSE_HEADING = re.compile(r"^###\s+(\d+):(\d+)\s*$")


def load_remap():
    spec = importlib.util.spec_from_file_location(
        "remap", ROOT / "tools" / "remap_proper_names.py"
    )
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


def chapter_count(slug: str) -> int:
    n = 0
    for ch in range(1, 200):
        try:
            verses = list_verses(slug, ch)
        except Exception:
            break
        if not verses:
            break
        n = ch
    return n


def queue_path(slug: str, ch: int) -> Path:
    book = get_book(slug)
    return ROOT / "pipeline" / book.testament / book.slug / f"{book.slug}-{ch}.queue.json"


def progress(slug: str) -> dict:
    last = chapter_count(slug)
    have = passed = holds = errors = 0
    error_refs: list[tuple[int, int]] = []
    for ch in range(1, last + 1):
        path = queue_path(slug, ch)
        if not path.is_file():
            continue
        have += 1
        q = json.loads(path.read_text(encoding="utf-8"))
        passed += len(q.get("passed") or [])
        holds += len(q.get("holds") or [])
        for item in q.get("errors") or []:
            errors += 1
            if item.get("verse") is not None:
                error_refs.append((ch, int(item["verse"])))
    return {
        "chapters": last,
        "queued": have,
        "complete": have == last,
        "passed": passed,
        "holds": holds,
        "errors": errors,
        "error_refs": error_refs,
    }


def roll_holds(slug: str) -> Path:
    book = get_book(slug)
    log_dir = ROOT / "pipeline" / book.testament / book.slug / "_logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    holds: list[dict] = []
    passed = errors = chapters = 0
    last = chapter_count(slug)
    for ch in range(1, last + 1):
        path = queue_path(slug, ch)
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
    out = log_dir / "parked-holds.json"
    payload = {
        "book": book.slug,
        "mode": "scripts-only; agent reserved for parked holds",
        "chaptersWithQueues": chapters,
        "passedVerses": passed,
        "errorVerses": errors,
        "holdCount": len(holds),
        "holds": holds,
    }
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {out} holds={len(holds)} passed={passed} errors={errors}")
    return out


def best_spanish(slug: str, ch: int, vs: int, remap) -> str | None:
    for path in (
        polish_path(slug, ch, vs, "sonnet5"),
        polish_path(slug, ch, vs, "pulir"),
        draft_path(slug, ch, vs, "gpt56"),
    ):
        if path.is_file():
            sp = (json.loads(path.read_text(encoding="utf-8")).get("spanish") or "").strip()
            if sp:
                return remap.apply_names(sp)[0]
    return None


def parse_book(text: str):
    verses: dict[tuple[int, int], list[str]] = {}
    preamble: list[str] = []
    cur = None
    buf: list[str] = []
    for line in text.splitlines():
        match = VERSE_HEADING.match(line)
        if match:
            if cur is None:
                preamble = buf[:]
            else:
                verses[cur] = buf[:]
            cur = (int(match.group(1)), int(match.group(2)))
            buf = []
            continue
        buf.append(line)
    if cur is not None:
        verses[cur] = buf
    else:
        preamble = buf
    verse_text = {}
    for key, body in verses.items():
        while body and body[0].strip() == "":
            body = body[1:]
        while body and body[-1].strip() == "":
            body = body[:-1]
        verse_text[key] = "\n".join(body).strip()
    return "\n".join(preamble).rstrip() + "\n", verse_text


def apply_passed(slug: str) -> int:
    remap = load_remap()
    book = get_book(slug)
    path = ROOT / "translation" / book.testament / f"{book.slug}.md"
    preamble, verses = parse_book(path.read_text(encoding="utf-8"))
    has_cap = bool(re.search(r"^## Capítulo", path.read_text(encoding="utf-8"), re.M))
    passed: set[tuple[int, int]] = set()
    last = chapter_count(slug)
    for ch in range(1, last + 1):
        qpath = queue_path(slug, ch)
        if not qpath.is_file():
            continue
        for v in json.loads(qpath.read_text(encoding="utf-8")).get("passed") or []:
            passed.add((ch, int(v)))
    applied = 0
    for ch, vs in sorted(passed):
        sp = best_spanish(slug, ch, vs, remap)
        if not sp:
            continue
        if verses.get((ch, vs)) != sp:
            verses[(ch, vs)] = sp
            applied += 1
    parts = [preamble.rstrip(), ""]
    current_ch = None
    for ch in range(1, last + 1):
        for vs in list_verses(slug, ch):
            if has_cap and ch != current_ch:
                if current_ch is not None:
                    parts.append("")
                parts.append(f"## Capítulo {ch}")
                parts.append("")
                current_ch = ch
            parts.append(f"### {ch}:{vs}")
            parts.append("")
            parts.append(verses.get((ch, vs), ""))
            parts.append("")
    path.write_text("\n".join(parts).rstrip() + "\n", encoding="utf-8")
    print(f"applied {applied} changed verses ({len(passed)} passed refs) -> {path}")
    return applied


def retry_errors(slug: str, refs: list[tuple[int, int]]) -> None:
    for ch, vs in refs:
        print(f"retry {ch}:{vs}", flush=True)
        subprocess.run(
            [
                sys.executable,
                str(ROOT / "tools/pipeline/run_chapter.py"),
                slug,
                str(ch),
                "--from",
                str(vs),
                "--to",
                str(vs),
            ],
            cwd=str(ROOT),
            check=False,
        )


def finish(slug: str) -> int:
    stats = progress(slug)
    if not stats["complete"]:
        print(
            f"not complete: queued {stats['queued']}/{stats['chapters']} "
            f"passed={stats['passed']} holds={stats['holds']} errors={stats['errors']}"
        )
        return 2
    if stats["error_refs"]:
        retry_errors(slug, stats["error_refs"])
        stats = progress(slug)
    apply_passed(slug)
    roll_holds(slug)
    print(
        f"DONE {slug}: passed={stats['passed']} holds={stats['holds']} errors={stats['errors']}"
    )
    return 0


def watch(slug: str, interval: int = 60) -> int:
    print(f"watching {slug} every {interval}s", flush=True)
    while True:
        stats = progress(slug)
        print(
            f"{time.strftime('%H:%M:%S')} queued {stats['queued']}/{stats['chapters']} "
            f"passed={stats['passed']} holds={stats['holds']} errors={stats['errors']}",
            flush=True,
        )
        if stats["complete"]:
            return finish(slug)
        time.sleep(interval)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("book")
    parser.add_argument("--watch", action="store_true")
    parser.add_argument("--interval", type=int, default=60)
    args = parser.parse_args()
    if args.watch:
        return watch(args.book, args.interval)
    return finish(args.book)


if __name__ == "__main__":
    raise SystemExit(main())
