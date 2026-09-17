"""Load and run one verse through GPT → lint → Grok, then Sonnet if Grok warns.

Chapter default is economy (polish=warn). Verse buttons still run all four
stations. Never writes translation/*.md or STATUS.md.
"""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path

from audit_lib import (
    SYSTEM as GROK_SYSTEM,
    audit_path,
    build_user_prompt as grok_user_prompt,
    call_xai,
    normalize_audit,
    request_path as grok_request_path,
    write_json,
)
import env_load  # noqa: F401
from books import ROOT, get_book
from draft_lib import (
    build_user_prompt as gpt_user_prompt,
    call_openai,
    draft_path,
    load_system as gpt_system,
    normalize_draft,
    request_path as gpt_request_path,
)
from lint_lib import lint_path, lint_spanish
from polish_lib import (
    build_user_prompt as sonnet_user_prompt,
    call_sonnet,
    load_system as sonnet_system,
    normalize_polish,
    polish_path,
    request_path as sonnet_request_path,
)
from source_packet import build_packet, list_verses, packet_path, write_packet
from usage_lib import record_call, summarize_chapter

DRAFT_LABEL = "gpt56"
POLISH_LABEL = "pulir"


def keys() -> dict[str, bool]:
    return {
        "openai": bool(os.environ.get("OPENAI_API_KEY")),
        "anthropic": bool(os.environ.get("ANTHROPIC_API_KEY")),
        "xai": bool(os.environ.get("XAI_API_KEY") or os.environ.get("GROK_API_KEY")),
    }


def _read(path: Path) -> dict | None:
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def gates(draft: dict | None, draft_audit: dict | None, polish: dict | None) -> dict[str, bool]:
    draft_pass = bool(
        draft
        and draft_audit
        and draft_audit.get("verdict") == "pass"
        and draft_audit.get("spanish") == draft.get("spanish")
    )
    return {
        "canDraft": True,
        "canAuditDraft": bool(draft and draft.get("spanish")),
        "canPolish": draft_pass,
        "canAuditPolish": bool(polish and polish.get("spanish")),
        "draftPassed": draft_pass,
    }


def summarize_audit(audit: dict | None) -> dict | None:
    if not audit:
        return None
    return {
        "verdict": audit.get("verdict"),
        "findings": audit.get("findings") or [],
        "notes": audit.get("notes") or "",
        "spanish": audit.get("spanish") or "",
    }


def load_state(slug: str, chapter: int, verse: int, build_if_missing: bool = True) -> dict:
    book = get_book(slug)
    stored = packet_path(book, chapter, verse)
    if stored.is_file():
        packet = json.loads(stored.read_text(encoding="utf-8"))
    elif build_if_missing:
        packet = build_packet(slug, chapter, verse)
        stored = write_packet(packet)
    else:
        raise FileNotFoundError(f"no packet for {slug} {chapter}:{verse}")

    draft = _read(draft_path(slug, chapter, verse, DRAFT_LABEL))
    draft_audit = _read(audit_path(slug, chapter, verse, DRAFT_LABEL))
    polish = _read(polish_path(slug, chapter, verse, "sonnet5"))
    polish_audit = _read(audit_path(slug, chapter, verse, POLISH_LABEL))
    return {
        "book": book.slug,
        "label": book.label,
        "testament": book.testament,
        "textualBasis": packet.get("textualBasis"),
        "reference": packet.get("reference"),
        "chapter": chapter,
        "verse": verse,
        "packetPath": str(stored),
        "tokens": [
            {
                "sourceTokenId": t.get("sourceTokenId"),
                "surface": t.get("surface"),
                "strongs": t.get("strongs"),
                "morph": t.get("morph"),
                "morphExpanded": t.get("morphExpanded") or t.get("morph"),
            }
            for t in packet.get("tokens") or []
        ],
        "draft": None
        if not draft
        else {"spanish": draft.get("spanish"), "units": draft.get("units") or []},
        "draftAudit": summarize_audit(draft_audit),
        "polish": None
        if not polish
        else {
            "spanish": polish.get("spanish"),
            "grammarChanges": polish.get("grammarChanges") or [],
            "sourceDraft": polish.get("sourceDraft"),
        },
        "polishAudit": summarize_audit(polish_audit),
        "keys": keys(),
        "gates": gates(draft, draft_audit, polish),
    }


def run_draft(slug: str, chapter: int, verse: int) -> dict:
    book = get_book(slug)
    stored = packet_path(book, chapter, verse)
    if stored.is_file():
        packet = json.loads(stored.read_text(encoding="utf-8"))
    else:
        packet = build_packet(slug, chapter, verse)
        stored = write_packet(packet)
    system = gpt_system()
    user = gpt_user_prompt(packet)
    write_json(
        gpt_request_path(slug, chapter, verse, DRAFT_LABEL),
        {"system": system, "user": user, "packetRef": str(stored)},
    )
    raw, usage = call_openai(system, user)
    record_call(slug, chapter, verse, "draft", usage)
    draft = normalize_draft(raw, packet, DRAFT_LABEL)
    out = draft_path(slug, chapter, verse, DRAFT_LABEL)
    write_json(out, draft)
    return {"ok": True, "path": str(out), "spanish": draft["spanish"]}


def run_audit_draft(slug: str, chapter: int, verse: int) -> dict:
    book = get_book(slug)
    packet = json.loads(packet_path(book, chapter, verse).read_text(encoding="utf-8"))
    draft = _read(draft_path(slug, chapter, verse, DRAFT_LABEL))
    if not draft or not draft.get("spanish"):
        raise RuntimeError("no GPT draft to audit")
    spanish = draft["spanish"]
    user = grok_user_prompt(packet, spanish, DRAFT_LABEL)
    write_json(
        grok_request_path(slug, chapter, verse, DRAFT_LABEL),
        {"system": GROK_SYSTEM, "user": user, "packetRef": str(packet_path(book, chapter, verse))},
    )
    raw, usage = call_xai(GROK_SYSTEM, user)
    record_call(slug, chapter, verse, "audit-draft", usage)
    audit = normalize_audit(raw, packet, spanish, DRAFT_LABEL)
    out = audit_path(slug, chapter, verse, DRAFT_LABEL)
    write_json(out, audit)
    return {"ok": True, "path": str(out), "verdict": audit["verdict"], "findings": audit["findings"]}


def run_polish(slug: str, chapter: int, verse: int) -> dict:
    book = get_book(slug)
    packet = json.loads(packet_path(book, chapter, verse).read_text(encoding="utf-8"))
    draft = _read(draft_path(slug, chapter, verse, DRAFT_LABEL))
    audit = _read(audit_path(slug, chapter, verse, DRAFT_LABEL))
    if not gates(draft, audit, None)["canPolish"]:
        raise RuntimeError("Grok must pass the GPT draft before Sonnet may polish")
    system = sonnet_system()
    user = sonnet_user_prompt(packet, draft, audit)
    write_json(
        sonnet_request_path(slug, chapter, verse, "sonnet5"),
        {"system": system, "user": user, "packetRef": str(packet_path(book, chapter, verse))},
    )
    raw, usage = call_sonnet(system, user)
    record_call(slug, chapter, verse, "polish", usage)
    polish = normalize_polish(raw, packet, draft, "sonnet5")
    out = polish_path(slug, chapter, verse, "sonnet5")
    write_json(out, polish)
    if polish.get("meaningChanges"):
        raise RuntimeError("Sonnet reported meaningChanges; polish rejected")
    return {"ok": True, "path": str(out), "spanish": polish["spanish"]}


def run_audit_polish(slug: str, chapter: int, verse: int) -> dict:
    book = get_book(slug)
    packet = json.loads(packet_path(book, chapter, verse).read_text(encoding="utf-8"))
    polish = _read(polish_path(slug, chapter, verse, "sonnet5"))
    if not polish or not polish.get("spanish"):
        raise RuntimeError("no Sonnet polish to audit")
    spanish = polish["spanish"]
    user = grok_user_prompt(packet, spanish, POLISH_LABEL)
    write_json(
        grok_request_path(slug, chapter, verse, POLISH_LABEL),
        {"system": GROK_SYSTEM, "user": user, "packetRef": str(packet_path(book, chapter, verse))},
    )
    raw, usage = call_xai(GROK_SYSTEM, user)
    record_call(slug, chapter, verse, "audit-polish", usage)
    audit = normalize_audit(raw, packet, spanish, POLISH_LABEL)
    out = audit_path(slug, chapter, verse, POLISH_LABEL)
    write_json(out, audit)
    return {"ok": True, "path": str(out), "verdict": audit["verdict"], "findings": audit["findings"]}


def ingest_draft(slug: str, chapter: int, verse: int, raw: dict) -> dict:
    book = get_book(slug)
    packet = json.loads(packet_path(book, chapter, verse).read_text(encoding="utf-8"))
    draft = normalize_draft(raw, packet, DRAFT_LABEL)
    out = draft_path(slug, chapter, verse, DRAFT_LABEL)
    write_json(out, draft)
    return {"ok": True, "path": str(out), "spanish": draft["spanish"]}


def ingest_audit(slug: str, chapter: int, verse: int, stage: str, raw: dict) -> dict:
    book = get_book(slug)
    packet = json.loads(packet_path(book, chapter, verse).read_text(encoding="utf-8"))
    if stage == "polish":
        polish = _read(polish_path(slug, chapter, verse, "sonnet5"))
        if not polish:
            raise RuntimeError("no polish to attach this audit to")
        spanish = polish["spanish"]
        label = POLISH_LABEL
    else:
        draft = _read(draft_path(slug, chapter, verse, DRAFT_LABEL))
        if not draft:
            raise RuntimeError("no draft to attach this audit to")
        spanish = draft["spanish"]
        label = DRAFT_LABEL
    audit = normalize_audit(raw, packet, spanish, label)
    out = audit_path(slug, chapter, verse, label)
    write_json(out, audit)
    return {"ok": True, "path": str(out), "verdict": audit["verdict"], "findings": audit["findings"]}


def queue_path(slug: str, chapter: int) -> Path:
    book = get_book(slug)
    return ROOT / "pipeline" / book.testament / book.slug / f"{book.slug}-{chapter}.queue.json"


def polish_passed(polish: dict | None, polish_audit: dict | None) -> bool:
    return bool(
        polish
        and polish_audit
        and polish_audit.get("verdict") == "pass"
        and polish_audit.get("spanish") == polish.get("spanish")
    )


def grok_warns(audit: dict | None) -> bool:
    return any(item.get("severity") == "warn" for item in (audit or {}).get("findings") or [])


def needs_polish(audit: dict | None, *, polish: str = "warn") -> bool:
    if polish == "always":
        return True
    if polish == "never":
        return False
    return grok_warns(audit)


def verse_disk_status(slug: str, chapter: int, verse: int, *, polish: str = "warn") -> str:
    """passed | hold | pending. Reads artifacts only; does not build a packet."""
    draft = _read(draft_path(slug, chapter, verse, DRAFT_LABEL))
    lint = _read(lint_path(slug, chapter, verse))
    draft_audit = _read(audit_path(slug, chapter, verse, DRAFT_LABEL))
    polish_json = _read(polish_path(slug, chapter, verse, "sonnet5"))
    polish_audit = _read(audit_path(slug, chapter, verse, POLISH_LABEL))
    spanish = (draft or {}).get("spanish")
    if lint and lint.get("verdict") == "fail" and lint.get("spanish") == spanish:
        return "hold"
    if draft_audit and draft_audit.get("verdict") == "fail":
        return "hold"
    if polish_audit and polish_audit.get("verdict") == "fail":
        return "hold"
    if not gates(draft, draft_audit, polish_json)["draftPassed"]:
        return "pending"
    if needs_polish(draft_audit, polish=polish):
        return "passed" if polish_passed(polish_json, polish_audit) else "pending"
    return "passed"


def empty_queue(slug: str, chapter: int, verses: list[int]) -> dict:
    book = get_book(slug)
    return {
        "schema": "lbf-chapter-queue-v1",
        "book": book.slug,
        "label": book.label,
        "chapter": chapter,
        "verses": verses,
        "passed": [],
        "holds": [],
        "errors": [],
        "skipped": [],
        "updated": datetime.now(timezone.utc).isoformat(),
        "running": False,
        "currentVerse": None,
        "currentStage": None,
    }


def hold_record(verse: int, stage: str, fail: dict | None, spanish: str | None = None) -> dict:
    fail = fail or {}
    return {
        "status": "hold",
        "verse": verse,
        "stage": stage,
        "verdict": fail.get("verdict") or "fail",
        "spanish": spanish or fail.get("spanish") or "",
        "notes": fail.get("notes") or "",
        "findings": fail.get("findings") or [],
    }


def public_error(raw: str) -> str:
    text = str(raw or "").strip()
    try:
        payload = json.loads(text)
        inner = payload.get("error") if isinstance(payload, dict) else None
        if isinstance(inner, dict) and inner.get("message"):
            return str(inner["message"])
        if isinstance(payload, dict) and payload.get("message"):
            return str(payload["message"])
    except json.JSONDecodeError:
        pass
    return text


def load_queue(slug: str, chapter: int) -> dict:
    verses = list_verses(slug, chapter)
    path = queue_path(slug, chapter)
    stored = _read(path)
    queue = empty_queue(slug, chapter, verses)
    if stored:
        queue.update(
            {
                "passed": stored.get("passed") or [],
                "holds": stored.get("holds") or [],
                "errors": stored.get("errors") or [],
                "skipped": stored.get("skipped") or [],
                "updated": stored.get("updated") or queue["updated"],
            }
        )
    queue["errors"] = [
        {
            "verse": item.get("verse"),
            "error": item.get("error") or "",
            "message": item.get("message") or public_error(item.get("error") or ""),
        }
        for item in (queue.get("errors") or [])
    ]
    disk_holds = []
    disk_passed = []
    for verse in verses:
        status = verse_disk_status(slug, chapter, verse)
        if status == "hold":
            draft_audit = _read(audit_path(slug, chapter, verse, DRAFT_LABEL)) or {}
            polish_audit = _read(audit_path(slug, chapter, verse, POLISH_LABEL)) or {}
            lint = _read(lint_path(slug, chapter, verse)) or {}
            if lint.get("verdict") == "fail":
                fail, stage = lint, "lint"
            elif draft_audit.get("verdict") == "fail":
                fail, stage = draft_audit, "audit-draft"
            else:
                fail, stage = polish_audit, "audit-polish"
            disk_holds.append(hold_record(verse, stage, fail))
        elif status == "passed":
            disk_passed.append(verse)
    hold_verses = {item["verse"] for item in disk_holds}
    queue["holds"] = disk_holds
    queue["passed"] = [vs for vs in verses if vs in set(disk_passed) and vs not in hold_verses]
    resolved = set(queue["passed"]) | hold_verses
    queue["errors"] = [item for item in queue["errors"] if item.get("verse") not in resolved]
    return queue


def save_queue(queue: dict) -> Path:
    path = queue_path(queue["book"], int(queue["chapter"]))
    queue["updated"] = datetime.now(timezone.utc).isoformat()
    write_json(path, queue)
    return path


def require_keys(*, sonnet: bool = False) -> None:
    present = keys()
    needed = [("GPT", present["openai"]), ("Grok", present["xai"])]
    if sonnet:
        needed.append(("Sonnet", present["anthropic"]))
    missing = [name for name, ok in needed if not ok]
    if missing:
        raise RuntimeError("no API keys for " + ", ".join(missing))


def run_one_verse(
    slug: str,
    chapter: int,
    verse: int,
    *,
    resume: bool = True,
    polish: str = "warn",
    steps: dict | None = None,
) -> dict:
    """Chapter default: GPT → lint → Grok. Sonnet only if Grok warns.

    Never writes translation/*.md or STATUS.md.
    """
    fns = steps or {}
    status = verse_disk_status(slug, chapter, verse, polish=polish)
    if resume and status == "passed":
        return {"status": "skipped", "reason": "passed", "verse": verse}
    if resume and status == "hold":
        return {"status": "skipped", "reason": "hold", "verse": verse, "stage": "parked"}

    draft = _read(draft_path(slug, chapter, verse, DRAFT_LABEL))
    if not draft or not draft.get("spanish"):
        (fns.get("draft") or run_draft)(slug, chapter, verse)
        draft = _read(draft_path(slug, chapter, verse, DRAFT_LABEL))

    spanish = (draft or {}).get("spanish") or ""
    lint_findings = lint_spanish(spanish)
    if lint_findings:
        write_json(
            lint_path(slug, chapter, verse),
            {
                "schema": "lbf-lint-v1",
                "auditor": "lint",
                "book": slug,
                "chapter": chapter,
                "verse": verse,
                "spanish": spanish,
                "verdict": "fail",
                "findings": lint_findings,
            },
        )
        return hold_record(verse, "lint", {"verdict": "fail", "findings": lint_findings}, spanish)

    draft_audit = _read(audit_path(slug, chapter, verse, DRAFT_LABEL))
    if not draft_audit or draft_audit.get("spanish") != spanish:
        (fns.get("audit_draft") or run_audit_draft)(slug, chapter, verse)
        draft_audit = _read(audit_path(slug, chapter, verse, DRAFT_LABEL))
    if not draft_audit or draft_audit.get("verdict") != "pass":
        return hold_record(verse, "audit-draft", draft_audit, spanish)

    if not needs_polish(draft_audit, polish=polish):
        return {"status": "passed", "verse": verse, "stage": "audit-draft"}

    if not keys()["anthropic"]:
        return hold_record(
            verse,
            "polish",
            {
                "verdict": "fail",
                "findings": [
                    {
                        "severity": "fail",
                        "issue": "Grok warned; no ANTHROPIC_API_KEY",
                        "sourceTokenIds": [],
                    }
                ],
            },
            spanish,
        )

    polish_json = _read(polish_path(slug, chapter, verse, "sonnet5"))
    if not polish_json or not polish_json.get("spanish"):
        (fns.get("polish") or run_polish)(slug, chapter, verse)
        polish_json = _read(polish_path(slug, chapter, verse, "sonnet5"))

    polish_audit = _read(audit_path(slug, chapter, verse, POLISH_LABEL))
    if not polish_audit or polish_audit.get("spanish") != polish_json.get("spanish"):
        (fns.get("audit_polish") or run_audit_polish)(slug, chapter, verse)
        polish_audit = _read(audit_path(slug, chapter, verse, POLISH_LABEL))
    if not polish_passed(polish_json, polish_audit):
        return hold_record(verse, "audit-polish", polish_audit, (polish_json or {}).get("spanish"))
    return {"status": "passed", "verse": verse, "stage": "audit-polish"}


_chapter_job = {
    "running": False,
    "book": None,
    "chapter": None,
    "verse": None,
    "stage": None,
    "error": None,
}
_chapter_lock = threading.Lock()


def chapter_job() -> dict:
    with _chapter_lock:
        return dict(_chapter_job)


def run_chapter(
    slug: str,
    chapter: int,
    *,
    start: int = 1,
    end: int | None = None,
    resume: bool = True,
    require_api_keys: bool = True,
    polish: str = "warn",
    steps: dict | None = None,
    on_progress: object | None = None,
) -> dict:
    if require_api_keys:
        require_keys(sonnet=polish == "always")
    verses = [vs for vs in list_verses(slug, chapter) if vs >= start and (end is None or vs <= end)]
    queue = load_queue(slug, chapter)
    queue["running"] = True
    book = get_book(slug)
    with _chapter_lock:
        _chapter_job.update(
            {
                "running": True,
                "book": book.slug,
                "chapter": chapter,
                "verse": None,
                "stage": "starting",
                "error": None,
            }
        )
    try:
        for verse in verses:
            with _chapter_lock:
                _chapter_job.update({"verse": verse, "stage": "running"})
            queue["currentVerse"] = verse
            queue["currentStage"] = "running"
            save_queue(queue)
            try:
                result = run_one_verse(
                    slug, chapter, verse, resume=resume, polish=polish, steps=steps
                )
            except Exception as exc:
                result = {"status": "error", "verse": verse, "error": str(exc)}
            queue["errors"] = [item for item in queue["errors"] if item.get("verse") != verse]
            if result["status"] == "passed":
                if verse not in queue["passed"]:
                    queue["passed"].append(verse)
                queue["holds"] = [item for item in queue["holds"] if item["verse"] != verse]
            elif result["status"] == "hold":
                queue["holds"] = [item for item in queue["holds"] if item["verse"] != verse]
                queue["holds"].append(
                    {
                        "verse": verse,
                        "stage": result.get("stage"),
                        "verdict": result.get("verdict"),
                        "spanish": result.get("spanish") or "",
                        "notes": result.get("notes") or "",
                        "findings": result.get("findings") or [],
                    }
                )
                queue["passed"] = [item for item in queue["passed"] if item != verse]
            elif result["status"] == "skipped":
                if verse not in queue["skipped"]:
                    queue["skipped"].append(verse)
            else:
                queue["errors"].append(
                    {
                        "verse": verse,
                        "error": result.get("error") or "error",
                        "message": public_error(result.get("error") or "error"),
                    }
                )
            queue["currentStage"] = result["status"]
            save_queue(queue)
            if on_progress:
                on_progress(result)
        return queue
    finally:
        try:
            queue["usage"] = summarize_chapter(slug, chapter)
        except Exception:
            pass
        queue["running"] = False
        queue["currentVerse"] = None
        queue["currentStage"] = None
        save_queue(queue)
        with _chapter_lock:
            _chapter_job.update({"running": False, "verse": None, "stage": None})


def start_chapter(slug: str, chapter: int, **kwargs) -> dict:
    get_book(slug)
    if kwargs.get("require_api_keys", True):
        require_keys(sonnet=kwargs.get("polish", "warn") == "always")
    with _chapter_lock:
        if _chapter_job["running"]:
            raise RuntimeError("a chapter is already running")
        _chapter_job["running"] = True
        _chapter_job["book"] = slug
        _chapter_job["chapter"] = chapter
        _chapter_job["error"] = None

    def work() -> None:
        try:
            run_chapter(slug, chapter, **kwargs)
        except Exception as exc:
            with _chapter_lock:
                _chapter_job["error"] = str(exc)
            queue = load_queue(slug, chapter)
            queue["errors"].append({"verse": 0, "error": str(exc)})
            queue["running"] = False
            save_queue(queue)
        finally:
            with _chapter_lock:
                _chapter_job["running"] = False

    threading.Thread(target=work, daemon=True).start()
    return {"ok": True, "started": True, "book": slug, "chapter": chapter}
