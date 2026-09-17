"""Grok 4.6 source-fidelity auditor.

Grok does not rewrite. It cites tokens or the finding is discarded.

    python3 tools/pipeline/audit_grok.py exodo 1 16 --spanish '...'
    python3 tools/pipeline/audit_grok.py exodo 1 16 --candidate-file path.json --prompt-only
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from books import ROOT, get_book
from source_packet import (
    build_packet,
    dump_prompt,
    packet_for_prompt,
    packet_path,
    write_packet,
)
from usage_lib import extract_usage

AUDIT_SCHEMA = "lbf-grok-audit-v1"

SYSTEM = """You are the source-fidelity auditor for La Biblia Fiel.

You do NOT translate. You do NOT rewrite. You only judge whether the candidate
Spanish is licensed by the supplied source packet.

ALLOWED EVIDENCE: only the packet tokens (TR1894 or OSHB/WLC surface, lemma,
Strong's, morphology, Paleo consonants, and AHRC root evidence marked
investigative-nonbinding).

FORBIDDEN: memory of any Bible version, theology, typology, traditional
renderings, RV1909, RVR1960, BLE glosses, or any source not in the packet.

FAIL when the Spanish:
- adds a concept the tokens do not license
- omits a licensed concept
- resolves an ambiguity the morphology/lemma leave open (e.g. dual "stones"
  rendered as a specialized instrument)
- lets AHRC override lemma/morphology
- inserts theology, titles, or doctrinal capitalization not in the tokens
- dumps untranslated non-name lemmas as Spanish (Elohím for אלהים → Dios)
- scholar-dumps or respells locked proper names (Mitsráyim / Jacob /
  Egipto / José when the packet referent is locked as Mizraim / Yaakov /
  Yosef in translation/PROPER_NAMES.md)
- changes number, person, stem force, or participants

PROPER NAMES: Hebraize names only. יהוה → Jehová. Common nouns stay
Spanish. Génesis done forms are orthography authority.

TARGET SPANISH: current Latin American (tú / ustedes). Vosotros (hagáis,
veréis, mataréis, os) is the wrong variety. Hebrew/Greek 2pl including 2fp
→ ustedes verbs (hagan, vean, matarán) is licensed 2nd-person address, not
a 3rd-person participant shift. Do not fail that as “they”. FAIL vosotros.
FAIL only if 2pl addressees become a different third party.

Piel ילד + 2fp + את + the Hebrew women: addressees act on the women; the
women give birth. FAIL “dar a luz a las hebreas” (addressees give birth to
the women). Dual stones stay stones. FAIL el sexo, entre las piernas,
birthstool, and extra noun parto/partos. Gender is in if-son / if-daughter.

WARN when uncertain, or when Spanish is grammatical smoothing that does not
change meaning.

PASS when the Spanish says neither more nor less than the tokens license,
preserving repetition and openness.

Every FAIL/WARN finding MUST cite one or more sourceTokenIds from the packet.
A finding without token ids is discarded.

Return JSON only:
{
  "verdict": "pass" | "fail",
  "findings": [
    {
      "severity": "fail" | "warn",
      "sourceTokenIds": ["h02001016007"],
      "issue": "short description of the mismatch",
      "spanishSpan": "the Spanish words in question or empty"
    }
  ],
  "notes": "optional one line"
}
verdict is fail if any finding has severity fail.
"""


def audit_path(book_slug: str, chapter: int, verse: int, label: str) -> Path:
    book = get_book(book_slug)
    safe = re.sub(r"[^a-z0-9._-]+", "-", label.lower()).strip("-") or "candidate"
    return (
        ROOT
        / "pipeline"
        / book.testament
        / book.slug
        / f"{book.slug}-{chapter}-{verse}.audit-{safe}.json"
    )


def request_path(book_slug: str, chapter: int, verse: int, label: str) -> Path:
    book = get_book(book_slug)
    safe = re.sub(r"[^a-z0-9._-]+", "-", label.lower()).strip("-") or "candidate"
    return (
        ROOT
        / "pipeline"
        / book.testament
        / book.slug
        / f"{book.slug}-{chapter}-{verse}.audit-{safe}.request.json"
    )


def build_user_prompt(packet: dict, spanish: str, label: str) -> str:
    payload = {
        "task": "audit-source-fidelity",
        "candidateLabel": label,
        "spanish": spanish,
        "packet": packet_for_prompt(packet),
    }
    return (
        "Audit this Spanish against the source packet. JSON only.\n\n"
        + dump_prompt(payload)
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


def normalize_audit(raw: dict, packet: dict, spanish: str, label: str) -> dict:
    allowed = allowed_token_ids(packet)
    findings = []
    for item in raw.get("findings") or []:
        ids = [tid for tid in (item.get("sourceTokenIds") or []) if tid in allowed]
        if not ids:
            continue
        severity = item.get("severity") or "warn"
        if severity not in {"fail", "warn"}:
            severity = "warn"
        findings.append(
            {
                "severity": severity,
                "sourceTokenIds": ids,
                "issue": str(item.get("issue") or "").strip(),
                "spanishSpan": str(item.get("spanishSpan") or "").strip(),
            }
        )
    has_fail = any(item["severity"] == "fail" for item in findings)
    return {
        "schema": AUDIT_SCHEMA,
        "auditor": "Grok 4.6",
        "book": packet["book"],
        "reference": packet["reference"],
        "chapter": packet["chapter"],
        "verse": packet["verse"],
        "candidateLabel": label,
        "spanish": spanish,
        "verdict": "fail" if has_fail else "pass",
        "findings": findings,
        "notes": str(raw.get("notes") or "").strip(),
        "discardedUncitedFindings": max(
            0, len(raw.get("findings") or []) - len(findings)
        ),
    }


def call_xai(system: str, user: str) -> tuple[dict, dict]:
    api_key = os.environ.get("XAI_API_KEY") or os.environ.get("GROK_API_KEY")
    if not api_key:
        raise RuntimeError("no XAI_API_KEY / GROK_API_KEY")
    model = os.environ.get("LBF_GROK_MODEL", "grok-4")
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    effort = (os.environ.get("LBF_GROK_REASONING") or "").strip()
    if effort:
        body["reasoning_effort"] = effort
    req = urllib.request.Request(
        "https://api.x.ai/v1/chat/completions",
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
    return parse_json_object(text), extract_usage("xai", model, payload)


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
