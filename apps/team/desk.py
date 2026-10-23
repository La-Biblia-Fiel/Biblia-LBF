"""Shared book desk. One GPT-5.6 Sol key, several books at once.

A person claims a book. Sol drafts empty verses only. Existing Spanish
stays. A passing verse is written into translation/. STATUS.md is never
touched, and a model pass is not human approval.
"""

from __future__ import annotations

import json
import os
import re
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "pipeline"))

import env_load  # noqa: E402,F401

os.environ["LBF_GPT_MODEL"] = os.environ.get("LBF_TEAM_GPT_MODEL", "gpt-5.6-sol")
os.environ["LBF_GPT_REASONING"] = os.environ.get("LBF_TEAM_REASONING", "medium")

from auto_pass import write_verse  # noqa: E402
from books import OT, NT, get_book  # noqa: E402
from draft_lib import call_openai, draft_path, write_json  # noqa: E402
from runner import public_error, run_one_verse  # noqa: E402
from source_packet import list_verses  # noqa: E402
from spanish_check_gpt import SYSTEM as SPANISH_SYSTEM  # noqa: E402
from spanish_check_gpt import artifact_path, normalize  # noqa: E402
from usage_lib import record_call  # noqa: E402

HEADING = re.compile(r"^###\s+(\d+):(\d+)\s*$")
VAR = Path(__file__).resolve().parent / "var"
CLAIMS = VAR / "claims.json"
PEOPLE = VAR / "people.json"
MAX_RUNNING = max(1, int(os.environ.get("LBF_TEAM_WORKERS", "4")))

_lock = threading.Lock()
_stops: dict[str, threading.Event] = {}
_threads: dict[str, threading.Thread] = {}
_totals: dict[str, int] = {}


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def model_name() -> str:
    return os.environ.get("LBF_GPT_MODEL", "gpt-5.6-sol")


def load_claims() -> dict:
    if not CLAIMS.is_file():
        return {}
    return json.loads(CLAIMS.read_text(encoding="utf-8"))


def save_claims(claims: dict) -> None:
    VAR.mkdir(parents=True, exist_ok=True)
    CLAIMS.write_text(json.dumps(claims, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_people() -> dict:
    if not PEOPLE.is_file():
        return {}
    data = json.loads(PEOPLE.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        return {}
    return {str(name): str(token) for name, token in data.items()}


def authorize(name: str, token: str) -> str:
    person = clean_name(name)
    for known, secret in load_people().items():
        if known.casefold() != person.casefold():
            continue
        if str(token or "").strip() != secret:
            raise ValueError("Name or token does not match.")
        return known
    raise ValueError("Name or token does not match.")


def clean_name(name: str) -> str:
    text = " ".join(str(name or "").split())
    if not text or len(text) > 40:
        raise ValueError("Enter your name (40 characters or fewer).")
    return text


def book_or_raise(slug: str):
    try:
        return get_book(slug)
    except KeyError as exc:
        raise ValueError(str(exc)) from exc


def claim(name: str, slug: str, token: str = "") -> dict:
    person = authorize(name, token)
    book = book_or_raise(slug)
    with _lock:
        claims = load_claims()
        current = claims.get(book.slug)
        if current and current.get("name") != person:
            raise ValueError(f"{book.label} is already held by {current.get('name')}.")
        claims[book.slug] = {
            "name": person,
            "running": bool(current and current.get("running") and _alive(book.slug)),
            "chapter": (current or {}).get("chapter"),
            "verse": (current or {}).get("verse"),
            "note": (current or {}).get("note") or "",
            "holds": (current or {}).get("holds") or [],
            "log": (current or {}).get("log") or [],
            "updated": now(),
        }
        save_claims(claims)
        return claims[book.slug]


def release(name: str, slug: str, token: str = "") -> None:
    person = authorize(name, token)
    book = book_or_raise(slug)
    with _lock:
        claims = load_claims()
        current = claims.get(book.slug)
        if not current:
            return
        if current.get("name") != person:
            raise ValueError(f"{book.label} is held by {current.get('name')}.")
        event = _stops.get(book.slug)
        if event:
            event.set()
        if _alive(book.slug):
            current["note"] = "Stopping after this verse"
            current["updated"] = now()
            save_claims(claims)
            raise ValueError(f"{book.label} is finishing its current verse. Release it again in a moment.")
        claims.pop(book.slug, None)
        save_claims(claims)


def _alive(slug: str) -> bool:
    thread = _threads.get(slug)
    return bool(thread and thread.is_alive())


def _note(claims: dict, slug: str, note: str, *, chapter=None, verse=None, hold: str | None = None) -> None:
    row = claims.get(slug)
    if not row:
        return
    row["note"] = note
    row["updated"] = now()
    if chapter is not None:
        row["chapter"] = chapter
    if verse is not None:
        row["verse"] = verse
    if hold:
        holds = row.setdefault("holds", [])
        if hold not in holds:
            holds.append(hold)
    log = row.setdefault("log", [])
    log.append(f"{note}")
    row["log"] = log[-30:]
    row["running"] = _alive(slug)
    save_claims(claims)


def verse_body(text: str, chapter: int, verse: int) -> str | None:
    """Return the Spanish under a heading, '' if the heading is empty, None if absent."""
    lines = text.splitlines()
    for index, line in enumerate(lines):
        match = HEADING.match(line.strip())
        if not match or int(match.group(1)) != chapter or int(match.group(2)) != verse:
            continue
        body = []
        for item in lines[index + 1 :]:
            if item.startswith("### ") or item.startswith("## "):
                break
            if item.strip() and not item.startswith(">"):
                body.append(item.strip())
        return " ".join(body).strip()
    return None


def filled_count(text: str) -> int:
    count = 0
    lines = text.splitlines()
    index = 0
    while index < len(lines):
        if not HEADING.match(lines[index].strip()):
            index += 1
            continue
        end = index + 1
        body = False
        while end < len(lines) and not lines[end].startswith("### ") and not lines[end].startswith("## "):
            if lines[end].strip() and not lines[end].startswith(">"):
                body = True
            end += 1
        if body:
            count += 1
        index = end
    return count


def translation_file(slug: str) -> Path:
    book = get_book(slug)
    return ROOT / "translation" / book.testament / f"{book.slug}.md"


def chapter_numbers(slug: str) -> list[int]:
    found = []
    for chapter in range(1, 200):
        try:
            verses = list_verses(slug, chapter)
        except Exception:
            break
        if not verses:
            break
        found.append(chapter)
    return found


def verse_total(slug: str) -> int:
    if slug not in _totals:
        total = 0
        for chapter in chapter_numbers(slug):
            total += len(list_verses(slug, chapter))
        _totals[slug] = total
    return _totals[slug]


def running_count() -> int:
    return sum(1 for slug in list(_threads) if _alive(slug))


def start(name: str, slug: str, token: str = "") -> None:
    person = authorize(name, token)
    book = book_or_raise(slug)
    with _lock:
        claims = load_claims()
        current = claims.get(book.slug)
        if not current or current.get("name") != person:
            raise ValueError(f"Claim {book.label} before starting Sol.")
        if _alive(book.slug):
            raise ValueError(f"{book.label} is still finishing its current verse.")
        if running_count() >= MAX_RUNNING:
            raise ValueError(f"{MAX_RUNNING} books are already running. Stop one before starting another.")
        event = threading.Event()
        _stops[book.slug] = event
        thread = threading.Thread(
            target=_work,
            args=(book.slug, person, event),
            name=f"lbf-sol-{book.slug}",
            daemon=True,
        )
        _threads[book.slug] = thread
        current["running"] = True
        current["note"] = "Starting Sol"
        current["updated"] = now()
        save_claims(claims)
        thread.start()


def stop(name: str, slug: str, token: str = "") -> None:
    person = authorize(name, token)
    book = book_or_raise(slug)
    with _lock:
        claims = load_claims()
        current = claims.get(book.slug)
        if current and current.get("name") != person:
            raise ValueError(f"{book.label} is held by {current.get('name')}.")
        event = _stops.get(book.slug)
        if event:
            event.set()
    thread = _threads.get(book.slug)
    if thread and thread.is_alive() and thread is not threading.current_thread():
        thread.join(timeout=2)
    with _lock:
        claims = load_claims()
        current = claims.get(book.slug)
        if current:
            current["running"] = _alive(book.slug)
            current["note"] = "Stopped" if not current["running"] else "Stopping after this verse"
            current["updated"] = now()
            save_claims(claims)


def _work(slug: str, person: str, event: threading.Event) -> None:
    message = ""
    try:
        for chapter in chapter_numbers(slug):
            if event.is_set():
                break
            for verse in list_verses(slug, chapter):
                if event.is_set():
                    break
                _one(slug, chapter, verse, event)
    except Exception as exc:  # noqa: BLE001
        message = "Stopped: " + public_error(str(exc))
    with _lock:
        claims = load_claims()
        row = claims.get(slug)
        if not row:
            return
        row["running"] = False
        if message:
            row["note"] = message
        elif event.is_set():
            row["note"] = "Stopped"
        else:
            row["note"] = "Finished the empty verses"
        row["updated"] = now()
        log = row.setdefault("log", [])
        log.append(row["note"])
        row["log"] = log[-30:]
        save_claims(claims)


def _one(slug: str, chapter: int, verse: int, event: threading.Event) -> None:
    path = translation_file(slug)
    existing = verse_body(path.read_text(encoding="utf-8"), chapter, verse) if path.is_file() else None
    if existing:
        return
    with _lock:
        _note(load_claims(), slug, f"Sol {chapter}:{verse}", chapter=chapter, verse=verse)
    if event.is_set():
        return
    result = run_one_verse(slug, chapter, verse, resume=True, polish="never", engine="api")
    status = result.get("status")
    if status in {"hold"} or (status == "skipped" and result.get("reason") == "hold"):
        with _lock:
            _note(load_claims(), slug, f"Parked {chapter}:{verse}", hold=f"{chapter}:{verse}")
        return
    if status not in {"passed", "skipped"}:
        raise RuntimeError(result.get("error") or result.get("message") or f"{chapter}:{verse} {status}")
    _apply_if_clear(slug, chapter, verse)


def _apply_if_clear(slug: str, chapter: int, verse: int) -> None:
    draft_file = draft_path(slug, chapter, verse, "gpt56")
    if not draft_file.is_file():
        return
    draft = json.loads(draft_file.read_text(encoding="utf-8"))
    spanish = str(draft.get("spanish") or "").strip()
    if not spanish:
        return
    path = translation_file(slug)
    existing = verse_body(path.read_text(encoding="utf-8"), chapter, verse) if path.is_file() else None
    if existing:
        return
    check = artifact_path(slug, chapter, verse, "sol")
    saved = json.loads(check.read_text(encoding="utf-8")) if check.is_file() else None
    if not saved or saved.get("spanish") != spanish or saved.get("verdict") != "pass":
        user = "Verify this Spanish line. JSON only.\n\n" + json.dumps({"spanish": spanish}, ensure_ascii=False)
        raw, usage = call_openai(SPANISH_SYSTEM, user)
        record_call(slug, chapter, verse, "spanish-check-sol", usage)
        saved = normalize(raw, slug, chapter, verse, spanish)
        write_json(check, saved)
    if saved.get("verdict") != "pass":
        with _lock:
            _note(load_claims(), slug, f"Spanish hold {chapter}:{verse}", hold=f"{chapter}:{verse}")
        return
    write_verse(slug, chapter, verse, spanish)
    with _lock:
        _note(load_claims(), slug, f"Wrote {chapter}:{verse}")


def board() -> dict:
    claims = load_claims()
    books = []
    for book in (*OT, *NT):
        path = translation_file(book.slug)
        text = path.read_text(encoding="utf-8") if path.is_file() else ""
        row = claims.get(book.slug) or {}
        running = bool(row.get("name")) and _alive(book.slug)
        books.append({
            "slug": book.slug,
            "label": book.label,
            "testament": book.testament,
            "filled": filled_count(text),
            "total": _totals.get(book.slug),
            "holder": row.get("name") or "",
            "running": running,
            "chapter": row.get("chapter"),
            "verse": row.get("verse"),
            "note": row.get("note") or "",
            "holds": row.get("holds") or [],
            "log": row.get("log") or [],
        })
    return {
        "model": model_name(),
        "maxRunning": MAX_RUNNING,
        "running": running_count(),
        "people": sorted(load_people()),
        "books": books,
    }


def warm_totals() -> None:
    for book in (*OT, *NT):
        try:
            verse_total(book.slug)
        except Exception:
            _totals.setdefault(book.slug, 0)
