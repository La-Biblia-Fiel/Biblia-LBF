"""Sonnet 5 grammar polish (Pulir) for a Grok-passed GPT draft."""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path

from books import ROOT, get_book
from draft_lib import parse_json_object
from source_packet import dump_prompt, packet_for_prompt
from usage_lib import extract_usage

PROMPT_PATH = Path(__file__).resolve().parent / "polish_prompt.md"
POLISH_SCHEMA = "lbf-sonnet-polish-v1"


def load_system() -> str:
    return PROMPT_PATH.read_text(encoding="utf-8").strip()


def polish_path(book_slug: str, chapter: int, verse: int, label: str = "sonnet5") -> Path:
    book = get_book(book_slug)
    safe = re.sub(r"[^a-z0-9._-]+", "-", label.lower()).strip("-") or "sonnet5"
    return (
        ROOT
        / "pipeline"
        / book.testament
        / book.slug
        / f"{book.slug}-{chapter}-{verse}.polish-{safe}.json"
    )


def request_path(book_slug: str, chapter: int, verse: int, label: str = "sonnet5") -> Path:
    book = get_book(book_slug)
    safe = re.sub(r"[^a-z0-9._-]+", "-", label.lower()).strip("-") or "sonnet5"
    return (
        ROOT
        / "pipeline"
        / book.testament
        / book.slug
        / f"{book.slug}-{chapter}-{verse}.polish-{safe}.request.json"
    )


def freeze_from(draft: dict, audit: dict) -> list[str]:
    freeze = [
        "Keep participants and who acts on whom.",
        "Keep number; dual stones stay stones, never a seat or stool.",
        "Keep stem force; vivirá stays vivirá.",
        "Do not turn Grok warnings into interpretive rewrites.",
    ]
    for unit in draft.get("units") or []:
        freeze.append(f"licensed: {unit.get('es')} ← {unit.get('sourceTokenIds')}")
    for item in draft.get("uncertainties") or []:
        freeze.append(f"uncertainty stays open: {item}")
    for finding in audit.get("findings") or []:
        freeze.append(
            f"Grok {finding.get('severity')}: {finding.get('issue')} "
            f"[{finding.get('spanishSpan')}]"
        )
    return freeze


def build_user_prompt(packet: dict, draft: dict, audit: dict) -> str:
    payload = {
        "task": "polish-spanish-only",
        "freeze": freeze_from(draft, audit),
        "draft": {
            "spanish": draft.get("spanish"),
            "units": draft.get("units"),
            "uncertainties": draft.get("uncertainties"),
        },
        "grokAudit": {
            "verdict": audit.get("verdict"),
            "findings": audit.get("findings"),
            "notes": audit.get("notes"),
        },
        "packet": packet_for_prompt(packet),
    }
    return (
        "Polish this Grok-passed draft. Grammar and flow only. JSON only.\n\n"
        + dump_prompt(payload)
    )


def allowed_token_ids(packet: dict) -> set[str]:
    return {
        str(token.get("sourceTokenId") or "")
        for token in packet.get("tokens") or []
        if token.get("sourceTokenId")
    }


def normalize_polish(raw: dict, packet: dict, draft: dict, label: str) -> dict:
    allowed = allowed_token_ids(packet)
    units = []
    dropped = 0
    for item in raw.get("units") or []:
        ids = [tid for tid in (item.get("sourceTokenIds") or []) if tid in allowed]
        es = str(item.get("es") or "").strip()
        if not es:
            continue
        if not ids:
            dropped += 1
            continue
        units.append({"es": es, "sourceTokenIds": ids})
    meaning = [str(x).strip() for x in (raw.get("meaningChanges") or []) if str(x).strip()]
    return {
        "schema": POLISH_SCHEMA,
        "polisher": "Claude Sonnet 5",
        "label": label,
        "book": packet["book"],
        "reference": packet["reference"],
        "chapter": packet["chapter"],
        "verse": packet["verse"],
        "sourceDraft": draft.get("spanish"),
        "spanish": str(raw.get("spanish") or "").strip(),
        "units": units,
        "grammarChanges": [str(x).strip() for x in (raw.get("grammarChanges") or []) if str(x).strip()],
        "meaningChanges": meaning,
        "droppedUncitedUnits": dropped,
    }


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def call_sonnet(system: str, user: str) -> tuple[dict, dict]:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("no ANTHROPIC_API_KEY")
    model = os.environ.get("LBF_SONNET_MODEL", "claude-sonnet-5")
    body = {
        "model": model,
        "max_tokens": 8000,
        "system": system,
        "messages": [{"role": "user", "content": user}],
    }
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise RuntimeError(exc.read().decode("utf-8")) from exc
    text = "".join(
        part.get("text", "")
        for part in payload.get("content", [])
        if part.get("type") == "text"
    )
    if not text.strip():
        raise RuntimeError("empty Sonnet text (thinking-only or truncated)")
    return parse_json_object(text), extract_usage("anthropic", model, payload)
