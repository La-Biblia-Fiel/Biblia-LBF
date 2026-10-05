"""Cursor Auto translation path.

The unattended command is auto_pass.py (it calls the Cursor CLI).
This module is the request-file loop used by run_chapter.py.

Auto drafts and audits. Sonnet steps in only when a verse is questionable
(lint, audit fail, audit warn, uncertainty, added concept, or dropped unit).
GPT and Grok are not called. Nothing here writes translation/*.md or STATUS.md.

Re-run the chapter after Cursor writes each reply JSON. One run ingests any
reply already on disk and writes the next request.
"""

from __future__ import annotations

import json
from pathlib import Path

from audit_lib import (
    SYSTEM as AUDIT_SYSTEM,
    audit_path,
    build_user_prompt as audit_user,
    normalize_audit,
    request_path as audit_request_path,
)
from books import get_book
from draft_lib import (
    build_user_prompt as draft_user,
    draft_path,
    load_system as draft_system,
    normalize_draft,
    request_path as draft_request_path,
)
from lint_lib import lint_path, lint_spanish
from polish_lib import (
    build_user_prompt as polish_user,
    load_system as polish_system,
    normalize_polish,
    polish_path,
    request_path as polish_request_path,
)
from source_packet import build_packet, packet_path

AUTO_LABEL = "auto"
POLISH_AUDIT_LABEL = "pulir"
SONNET_LABEL = "sonnet5"


def reply_for(request: Path) -> Path:
    return request.with_name(request.name.replace(".request.json", ".reply.json"))


def read_json(path: Path) -> dict | None:
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def unwrap(raw: dict, key: str) -> dict:
    inner = raw.get(key)
    return inner if isinstance(inner, dict) else raw


def ensure_packet(slug: str, chapter: int, verse: int) -> dict:
    book = get_book(slug)
    stored = packet_path(book, chapter, verse)
    if stored.is_file():
        return json.loads(stored.read_text(encoding="utf-8"))
    packet = build_packet(slug, chapter, verse)
    write_json(stored, packet)
    return packet


def warns(audit: dict | None) -> bool:
    return any(item.get("severity") == "warn" for item in (audit or {}).get("findings") or [])


def questionable(draft: dict | None, audit: dict | None, lint_findings: list) -> bool:
    """True when Sonnet should see this verse. A clean Auto pass is false."""
    if lint_findings:
        return True
    if not draft:
        return False
    if draft.get("uncertainties") or draft.get("addedConcepts") or draft.get("droppedUncitedUnits"):
        return True
    if not audit or audit.get("spanish") != draft.get("spanish"):
        return False
    if audit.get("verdict") != "pass":
        return True
    return warns(audit)


def needs_sonnet(draft: dict | None, audit: dict | None, lint_findings: list, *, polish: str) -> bool:
    if polish == "always":
        return True
    if polish == "never":
        return False
    return questionable(draft, audit, lint_findings)


def waiting(verse: int, stage: str, model: str, request: Path) -> dict:
    reply = reply_for(request)
    return {
        "status": "waiting",
        "verse": verse,
        "stage": stage,
        "model": model,
        "request": str(request),
        "reply": str(reply),
        "spanish": "",
    }


def hold(verse: int, stage: str, spanish: str, findings: list, notes: str = "") -> dict:
    return {
        "status": "hold",
        "verse": verse,
        "stage": stage,
        "verdict": "fail",
        "spanish": spanish or "",
        "notes": notes,
        "findings": findings or [],
    }


def matching(doc: dict | None, spanish: str) -> dict | None:
    if doc and doc.get("spanish") == spanish:
        return doc
    return None


def stale_reply(raw: dict, spanish: str) -> bool:
    reply_spanish = str(raw.get("spanish") or "").strip()
    return bool(reply_spanish) and reply_spanish != spanish.strip()


def load_draft(slug: str, chapter: int, verse: int, packet: dict) -> dict | None:
    path = draft_path(slug, chapter, verse, AUTO_LABEL)
    stored = read_json(path)
    if stored and stored.get("spanish"):
        return stored
    reply = read_json(reply_for(draft_request_path(slug, chapter, verse, AUTO_LABEL)))
    if not reply:
        return None
    draft = normalize_draft(unwrap(reply, "draft"), packet, AUTO_LABEL)
    if not draft.get("spanish"):
        return None
    write_json(path, draft)
    return draft


def load_audit(slug: str, chapter: int, verse: int, label: str, spanish: str, packet: dict) -> dict | None:
    path = audit_path(slug, chapter, verse, label)
    stored = matching(read_json(path), spanish)
    if stored:
        return stored
    reply = read_json(reply_for(audit_request_path(slug, chapter, verse, label)))
    if not reply:
        return None
    raw = unwrap(reply, "audit")
    if stale_reply(raw, spanish):
        return None
    audit = normalize_audit(raw, packet, spanish, label, auditor="Cursor Auto")
    write_json(path, audit)
    return audit


def load_polish(slug: str, chapter: int, verse: int, packet: dict, draft: dict) -> dict | None:
    path = polish_path(slug, chapter, verse, SONNET_LABEL)
    stored = read_json(path)
    if stored and stored.get("spanish"):
        return stored
    reply = read_json(reply_for(polish_request_path(slug, chapter, verse, SONNET_LABEL)))
    if not reply:
        return None
    polish = normalize_polish(unwrap(reply, "polish"), packet, draft, SONNET_LABEL)
    if not polish.get("spanish"):
        return None
    write_json(path, polish)
    return polish


def write_draft_request(slug: str, chapter: int, verse: int, packet: dict) -> Path:
    book = get_book(slug)
    stored = packet_path(book, chapter, verse)
    path = draft_request_path(slug, chapter, verse, AUTO_LABEL)
    write_json(
        path,
        {
            "model": "cursor-auto",
            "instruction": (
                "You are Cursor Auto, role Traduce. Draft from the packet only. "
                "Do not call GPT or Grok. Do not polish. Do not audit. "
                "Write only the draft JSON object to the reply path."
            ),
            "system": draft_system(),
            "user": draft_user(packet),
            "packetRef": str(stored),
            "book": slug,
            "chapter": chapter,
            "verse": verse,
            "replyPath": str(reply_for(path)),
        },
    )
    return path


def write_audit_request(
    slug: str, chapter: int, verse: int, packet: dict, spanish: str, label: str
) -> Path:
    book = get_book(slug)
    path = audit_request_path(slug, chapter, verse, label)
    write_json(
        path,
        {
            "model": "cursor-auto",
            "auditor": "cursor-auto",
            "instruction": (
                "You are Cursor Auto. Judge source fidelity. Do not rewrite. "
                "Do not call Grok. Cite sourceTokenIds from the packet or the finding is discarded. "
                "Write only the audit JSON object to the reply path."
            ),
            "system": AUDIT_SYSTEM,
            "user": audit_user(packet, spanish, label),
            "packetRef": str(packet_path(book, chapter, verse)),
            "book": slug,
            "chapter": chapter,
            "verse": verse,
            "spanish": spanish,
            "replyPath": str(reply_for(path)),
        },
    )
    return path


def write_sonnet_request(
    slug: str,
    chapter: int,
    verse: int,
    packet: dict,
    draft: dict,
    audit: dict | None,
    lint_findings: list,
) -> Path:
    book = get_book(slug)
    findings = list(lint_findings)
    if audit:
        findings.extend(audit.get("findings") or [])
    audit_for_prompt = audit or {
        "verdict": "fail" if lint_findings else "pass",
        "findings": lint_findings,
        "notes": "local lint; Cursor Auto has not audited this Spanish yet",
        "spanish": draft.get("spanish"),
    }
    path = polish_request_path(slug, chapter, verse, SONNET_LABEL)
    write_json(
        path,
        {
            "model": "claude-sonnet-5",
            "instruction": (
                "This verse is questionable. You are Sonnet. Repair only the cited "
                "mismatches so the Spanish stays licensed by the packet. "
                "A clean Auto pass must not reach you. Do not call GPT or Grok. "
                "Write only the polish JSON object to the reply path."
            ),
            "system": polish_system(),
            "user": polish_user(packet, draft, audit_for_prompt),
            "packetRef": str(packet_path(book, chapter, verse)),
            "book": slug,
            "chapter": chapter,
            "verse": verse,
            "why": "questionable",
            "findings": findings,
            "replyPath": str(reply_for(path)),
        },
    )
    return path


def record_lint(slug: str, chapter: int, verse: int, spanish: str, findings: list) -> None:
    write_json(
        lint_path(slug, chapter, verse),
        {
            "schema": "lbf-lint-v1",
            "auditor": "lint",
            "book": slug,
            "chapter": chapter,
            "verse": verse,
            "spanish": spanish,
            "verdict": "fail" if findings else "pass",
            "findings": findings,
        },
    )


def classify(slug: str, chapter: int, verse: int, *, polish: str = "warn") -> dict:
    """passed | hold | pending. Does not write requests or build a packet."""
    draft = read_json(draft_path(slug, chapter, verse, AUTO_LABEL))
    spanish = (draft or {}).get("spanish") or ""
    if not spanish:
        return {"status": "pending", "verse": verse}
    lint_findings = lint_spanish(spanish)
    audit = matching(read_json(audit_path(slug, chapter, verse, AUTO_LABEL)), spanish)
    polish_json = read_json(polish_path(slug, chapter, verse, SONNET_LABEL))
    polish_spanish = (polish_json or {}).get("spanish") or ""
    polish_audit = matching(
        read_json(audit_path(slug, chapter, verse, POLISH_AUDIT_LABEL)), polish_spanish
    )
    if polish_json and polish_spanish:
        polish_lint = lint_spanish(polish_spanish)
        if polish_lint:
            return hold(verse, "lint", polish_spanish, polish_lint, "Sonnet left a lint failure")
        if polish_audit and polish_audit.get("verdict") == "fail":
            return hold(
                verse,
                "audit-polish",
                polish_spanish,
                polish_audit.get("findings") or [],
                "Sonnet already stepped in",
            )
        if polish_audit and polish_audit.get("verdict") == "pass":
            return {"status": "passed", "verse": verse, "stage": "audit-polish"}
        return {"status": "pending", "verse": verse}
    if not needs_sonnet(draft, audit, lint_findings, polish=polish) and audit:
        return {"status": "passed", "verse": verse, "stage": "audit-draft"}
    if polish == "never" and (lint_findings or (audit and audit.get("verdict") == "fail")):
        return hold(verse, "lint" if lint_findings else "audit-draft", spanish, lint_findings or (audit or {}).get("findings") or [])
    return {"status": "pending", "verse": verse}


def run_verse(slug: str, chapter: int, verse: int, *, resume: bool = True, polish: str = "warn") -> dict:
    if resume:
        current = classify(slug, chapter, verse, polish=polish)
        if current["status"] == "passed":
            return {"status": "skipped", "reason": "passed", "verse": verse}
        if current["status"] == "hold":
            return {"status": "skipped", "reason": "hold", "verse": verse, "stage": "parked"}

    packet = ensure_packet(slug, chapter, verse)
    draft = load_draft(slug, chapter, verse, packet)
    if not draft or not draft.get("spanish"):
        return waiting(verse, "draft", "cursor-auto", write_draft_request(slug, chapter, verse, packet))

    spanish = draft["spanish"]
    lint_findings = lint_spanish(spanish)
    record_lint(slug, chapter, verse, spanish, lint_findings)

    audit = None if lint_findings else load_audit(slug, chapter, verse, AUTO_LABEL, spanish, packet)
    if not lint_findings and not audit:
        return waiting(
            verse,
            "audit-draft",
            "cursor-auto",
            write_audit_request(slug, chapter, verse, packet, spanish, AUTO_LABEL),
        )

    if not needs_sonnet(draft, audit, lint_findings, polish=polish):
        return {"status": "passed", "verse": verse, "stage": "audit-draft"}

    if polish == "never":
        return hold(
            verse,
            "lint" if lint_findings else "audit-draft",
            spanish,
            lint_findings or (audit or {}).get("findings") or [],
        )

    polish_json = load_polish(slug, chapter, verse, packet, draft)
    if not polish_json or not polish_json.get("spanish"):
        return waiting(
            verse,
            "polish",
            "sonnet",
            write_sonnet_request(slug, chapter, verse, packet, draft, audit, lint_findings),
        )

    polish_spanish = polish_json["spanish"]
    polish_lint = lint_spanish(polish_spanish)
    if polish_lint:
        record_lint(slug, chapter, verse, polish_spanish, polish_lint)
        return hold(verse, "lint", polish_spanish, polish_lint, "Sonnet left a lint failure")

    polish_audit = load_audit(slug, chapter, verse, POLISH_AUDIT_LABEL, polish_spanish, packet)
    if not polish_audit:
        return waiting(
            verse,
            "audit-polish",
            "cursor-auto",
            write_audit_request(slug, chapter, verse, packet, polish_spanish, POLISH_AUDIT_LABEL),
        )
    if polish_audit.get("verdict") == "fail":
        return hold(
            verse,
            "audit-polish",
            polish_spanish,
            polish_audit.get("findings") or [],
            "Sonnet already stepped in",
        )
    return {"status": "passed", "verse": verse, "stage": "audit-polish"}
