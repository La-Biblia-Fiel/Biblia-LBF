"""GPT-5.6 source-faithful verse draft (Traduce).

Does not write translation markdown or STATUS.md.
"""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path

from books import ROOT, get_book
from source_packet import dump_prompt, packet_for_prompt
from usage_lib import extract_usage

PROMPT_PATH = Path(__file__).resolve().parent / "draft_prompt.md"
DRAFT_SCHEMA = "lbf-gpt-draft-v1"


def load_system() -> str:
    return PROMPT_PATH.read_text(encoding="utf-8").strip()


def draft_path(book_slug: str, chapter: int, verse: int, label: str = "gpt56") -> Path:
    book = get_book(book_slug)
    safe = re.sub(r"[^a-z0-9._-]+", "-", label.lower()).strip("-") or "gpt56"
    return (
        ROOT
        / "pipeline"
        / book.testament
        / book.slug
        / f"{book.slug}-{chapter}-{verse}.draft-{safe}.json"
    )


def request_path(book_slug: str, chapter: int, verse: int, label: str = "gpt56") -> Path:
    book = get_book(book_slug)
    safe = re.sub(r"[^a-z0-9._-]+", "-", label.lower()).strip("-") or "gpt56"
    return (
        ROOT
        / "pipeline"
        / book.testament
        / book.slug
        / f"{book.slug}-{chapter}-{verse}.draft-{safe}.request.json"
    )


def build_user_prompt(packet: dict) -> str:
    return (
        "Draft this verse using ONLY the packet. JSON only.\n\n"
        + dump_prompt({"packet": packet_for_prompt(packet)})
    )


def parse_json_object(text: str) -> dict:
    raw = (text or "").strip()
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start, end = raw.find("{"), raw.rfind("}")
        if start >= 0 and end > start:
            return json.loads(raw[start : end + 1])
        raise


def allowed_token_ids(packet: dict) -> set[str]:
    return {
        str(token.get("sourceTokenId") or "")
        for token in packet.get("tokens") or []
        if token.get("sourceTokenId")
    }


def normalize_draft(raw: dict, packet: dict, label: str) -> dict:
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
    added = [str(x).strip() for x in (raw.get("addedConcepts") or []) if str(x).strip()]
    return {
        "schema": DRAFT_SCHEMA,
        "drafter": "GPT-5.6",
        "label": label,
        "book": packet["book"],
        "reference": packet["reference"],
        "chapter": packet["chapter"],
        "verse": packet["verse"],
        "spanish": str(raw.get("spanish") or "").strip(),
        "units": units,
        "uncertainties": [str(x).strip() for x in (raw.get("uncertainties") or []) if str(x).strip()],
        "addedConcepts": added,
        "droppedUncitedUnits": dropped,
    }


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def call_openai(system: str, user: str) -> tuple[dict, dict]:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("no OPENAI_API_KEY")
    model = os.environ.get("LBF_GPT_MODEL", "gpt-5.1")
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    effort = (os.environ.get("LBF_GPT_REASONING") or "low").strip()
    if effort:
        body["reasoning_effort"] = effort
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise RuntimeError(exc.read().decode("utf-8")) from exc
    text = payload["choices"][0]["message"]["content"]
    return parse_json_object(text), extract_usage("openai", model, payload)
