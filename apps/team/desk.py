"""Named-human chapter review for the closed LBF GPT workflow.

Models prepare evidence-bound candidates. Only the explicit review action
writes canonical Spanish. This module never writes a `done` status and never
promotes alignment seeds to canonical alignment.
"""

from __future__ import annotations

import json
import hashlib
import os
import re
import subprocess
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PIPELINE = ROOT / "tools" / "pipeline"
sys.path.insert(0, str(PIPELINE))
import env_load  # noqa: E402,F401

# The team workflow is deliberately not model-configurable. Changing this is a
# policy change, not an operator preference.
TEAM_MODEL = "gpt-5.6-sol"
TEAM_REASONING = "medium"
os.environ["LBF_GPT_MODEL"] = TEAM_MODEL
os.environ["LBF_GPT_REASONING"] = TEAM_REASONING

from auto_pass import write_verse  # noqa: E402
from books import OT, get_book  # noqa: E402
from lint_lib import lint_divine_name, lint_spanish  # noqa: E402
from source_packet import list_verses  # noqa: E402

HEADING = re.compile(r"^###\s+(\d+):(\d+)\s*$")
STATUS_COLUMNS = ("book", "testament", "translation", "alignment", "translation_by", "translation_on", "alignment_by", "alignment_on", "notes")
VAR = Path(__file__).resolve().parent / "var"
CLAIMS, PEOPLE = VAR / "claims.json", VAR / "people.json"
RECOVERED = VAR / "recovered-reviews"
STATUS = ROOT / "STATUS.md"
MAX_RUNNING = max(1, int(os.environ.get("LBF_TEAM_WORKERS", "4")))
_lock = threading.RLock()
_threads: dict[str, threading.Thread] = {}
_stops: dict[str, threading.Event] = {}
_chapter_counts: dict[str, int] = {}


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def model_name() -> str:
    return TEAM_MODEL


def reasoning_effort() -> str:
    return TEAM_REASONING


def read_json(path: Path, default=None):
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else default


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def packet_fingerprint(packet: dict) -> str:
    raw = json.dumps(packet, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(raw).hexdigest()


def object_fingerprint(value: dict) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(raw).hexdigest()


def load_claims() -> dict:
    data = read_json(CLAIMS, {})
    return data if isinstance(data, dict) else {}


def save_claims(value: dict) -> None:
    write_json(CLAIMS, value)


def load_people() -> dict:
    data = read_json(PEOPLE, {})
    return {str(k): str(v) for k, v in data.items()} if isinstance(data, dict) else {}


def clean_name(name: str) -> str:
    value = " ".join(str(name or "").split())
    if not value or len(value) > 40 or any(x in value for x in "\r\n|"):
        raise ValueError("Enter your registered name (40 characters or fewer).")
    return value


def authorize(name: str, token: str) -> str:
    person = clean_name(name)
    for known, secret in load_people().items():
        if known.casefold() == person.casefold() and str(token or "").strip() == secret:
            return known
    raise ValueError("Name or token does not match.")


def book_or_raise(slug: str):
    try:
        book = get_book(str(slug or ""))
    except KeyError as exc:
        raise ValueError(str(exc)) from exc
    if book.testament != "ot":
        raise ValueError("The New Testament is blocked until its equivalent evidence packet is authorized.")
    return book


def chapter_or_raise(slug: str, chapter):
    book = book_or_raise(slug)
    try:
        number = int(chapter)
        verses = list(list_verses(book.slug, number))
    except (TypeError, ValueError, KeyError) as exc:
        raise ValueError("Choose a canonical chapter.") from exc
    if not verses:
        raise ValueError(f"{book.label} {number} has no canonical verses.")
    return book, number, verses


def claim_key(slug: str, chapter: int) -> str:
    return f"{slug}:{chapter}"


def _alive(key: str) -> bool:
    return bool(_threads.get(key) and _threads[key].is_alive())


def claim(name, slug, chapter, token="") -> dict:
    person = authorize(name, token)
    book, number, _ = chapter_or_raise(slug, chapter)
    key = claim_key(book.slug, number)
    with _lock:
        claims = load_claims()
        old = claims.get(key)
        if old and old.get("name") != person:
            raise ValueError(f"{book.label} {number} is already held by {old.get('name')}.")
        claims[key] = {"book": book.slug, "chapter": number, "name": person, "running": _alive(key), "verse": (old or {}).get("verse"), "note": (old or {}).get("note") or "Claimed for human review", "updated": now()}
        save_claims(claims)
        return claims[key]


def assert_holder(person: str, slug: str, chapter: int):
    claims, key = load_claims(), claim_key(slug, chapter)
    if not claims.get(key) or claims[key].get("name") != person:
        raise ValueError(f"Claim {slug} {chapter} before reviewing it.")
    return claims, key


def release(name, slug, chapter, token="") -> None:
    person = authorize(name, token)
    book, number, _ = chapter_or_raise(slug, chapter)
    with _lock:
        claims, key = assert_holder(person, book.slug, number)
        if _alive(key):
            _stops[key].set()
            raise ValueError("Preparation is stopping after this verse. Release again when it stops.")
        claims.pop(key)
        save_claims(claims)


def pipeline_dir(slug: str) -> Path:
    book = book_or_raise(slug)
    return ROOT / "pipeline" / book.testament / book.slug


def packet_path(slug: str, chapter: int, verse: int) -> Path:
    return pipeline_dir(slug) / f"{slug}-{chapter}-{verse}.packet.json"


def human_path(slug: str, chapter: int, verse: int) -> Path:
    return pipeline_dir(slug) / f"{slug}-{chapter}-{verse}.candidate-human-reviewed.json"


def recovered_path(slug: str, chapter: int) -> Path:
    return RECOVERED / f"{slug}-{chapter}.json"


def save_review_attempt(book, chapter: int, verse: int, person: str, payload: dict) -> None:
    """Preserve a named human's exact form state even when validation rejects it."""
    path = recovered_path(book.slug, chapter)
    recovered = read_json(path, {})
    if not isinstance(recovered, dict):
        recovered = {}
    recovered.update(schema="lbf-recovered-browser-review-v1", book=book.slug, chapter=chapter)
    recovered.setdefault("note", "Trabajo humano guardado antes de la validación canónica.")
    verses = recovered.setdefault("verses", {})
    verses[str(verse)] = {
        "spanish": str(payload.get("spanish") or ""),
        "units": payload.get("units") if isinstance(payload.get("units"), list) else [],
        "decision": str(payload.get("decision") or ""),
        "sourceConfirmed": bool(payload.get("sourceConfirmed")),
        "alignmentConfirmed": bool(payload.get("alignmentConfirmed")),
        "lastAttemptedBy": person,
        "lastAttemptedOn": now(),
    }
    write_json(path, recovered)


def candidate_path(slug: str, chapter: int, verse: int) -> Path | None:
    folder = pipeline_dir(slug)
    options = [human_path(slug, chapter, verse), folder / f"{slug}-{chapter}-{verse}.draft-team-gpt.json", folder / f"{slug}-{chapter}-{verse}.draft-gpt56.json"]
    options += sorted(folder.glob(f"{slug}-{chapter}-{verse}.draft-gpt-*.json"), reverse=True)
    return next((path for path in options if path.is_file()), None)


def label_for(candidate: dict, path: Path) -> str:
    if candidate.get("label"):
        return str(candidate["label"])
    return path.name.split(".draft-", 1)[1][:-5] if ".draft-" in path.name else "human-reviewed"


def gate_for(slug: str, chapter: int, verse: int, path: Path, candidate: dict) -> dict:
    if candidate.get("schema") == "lbf-human-reviewed-candidate-v1":
        return {"source": path.name, "fidelity": "human", "spanish": "human"}
    label = label_for(candidate, path)
    folder = pipeline_dir(slug)
    audit = read_json(folder / f"{slug}-{chapter}-{verse}.audit-gpt-{label}.json", {})
    check = read_json(folder / f"{slug}-{chapter}-{verse}.spanish-check-{label}.json", {})
    return {"source": path.name, "label": label, "draftModel": candidate.get("model") or "unverified", "draftReasoning": candidate.get("reasoningEffort") or "unverified", "auditModel": audit.get("model") or "unverified", "auditReasoning": audit.get("reasoningEffort") or "unverified", "spanishModel": check.get("model") or "unverified", "spanishReasoning": check.get("reasoningEffort") or "unverified", "fidelity": audit.get("verdict") or "missing", "fidelityFindings": audit.get("findings") or [], "spanish": check.get("verdict") or "missing", "spanishFindings": check.get("findings") or []}


def human_precedents(slug: str) -> list[dict]:
    """Expose adjudication memory to people, never to a model prompt."""
    rows = []
    for path in sorted(pipeline_dir(slug).glob(f"{slug}-*-*.candidate-human-reviewed.json")):
        item = read_json(path, {})
        adjudication = item.get("adjudication") if isinstance(item, dict) else {}
        decision = str((adjudication or {}).get("decision") or "").strip()
        if not decision:
            continue
        rows.append({"reference": item.get("reference") or path.stem, "decision": decision})
    return rows


def public_packet(packet: dict) -> dict:
    keys = ("sourceTokenId", "position", "surface", "paleo", "lemma", "strongs", "morph", "morphExpanded")
    return {"schema": packet.get("schema"), "sourcePolicy": packet.get("sourcePolicy"), "evidenceStatus": packet.get("evidenceStatus"), "reference": packet.get("reference"), "textualBasis": packet.get("textualBasis"), "tokens": [{k: token.get(k) for k in keys} for token in packet.get("tokens") or []], "syntaxEvidence": packet.get("syntax"), "originalLanguageContext": packet.get("originalLanguageContext") or [], "corpusEvidence": packet.get("corpusEvidence") or [], "lexicalEvidence": packet.get("lexicalEvidence") or []}


def translation_file(slug: str) -> Path:
    book = book_or_raise(slug)
    return ROOT / "translation" / book.testament / f"{slug}.md"


def verse_body(text: str, chapter: int, verse: int) -> str | None:
    lines = text.splitlines()
    for index, line in enumerate(lines):
        match = HEADING.match(line.strip())
        if not match or (int(match.group(1)), int(match.group(2))) != (chapter, verse):
            continue
        body = []
        for item in lines[index + 1:]:
            if item.startswith("### ") or item.startswith("## "):
                break
            if item.strip() and not item.startswith(">"):
                body.append(item.strip())
        return " ".join(body).strip()
    return None


def chapter_view(slug: str, chapter) -> dict:
    book, number, verses = chapter_or_raise(slug, chapter)
    path = translation_file(slug)
    canonical = path.read_text(encoding="utf-8") if path.is_file() else ""
    recovered = read_json(recovered_path(slug, number), {})
    recovered_verses = recovered.get("verses") if isinstance(recovered, dict) else {}
    recovered_verses = recovered_verses if isinstance(recovered_verses, dict) else {}
    rows = []
    for verse in verses:
        packet = read_json(packet_path(slug, number, verse), {})
        candidate_file = candidate_path(slug, number, verse)
        candidate = read_json(candidate_file, {}) if candidate_file else {}
        rows.append({"verse": verse, "reference": f"{book.label} {number}:{verse}", "canonical": verse_body(canonical, number, verse) or "", "packet": public_packet(packet), "candidate": candidate, "recovered": recovered_verses.get(str(verse)) or {}, "gate": gate_for(slug, number, verse, candidate_file, candidate) if candidate_file else {"source": "missing", "fidelity": "missing", "spanish": "missing"}, "humanReviewed": candidate.get("schema") == "lbf-human-reviewed-candidate-v1"})
    return {"book": slug, "label": book.label, "chapter": number, "claim": load_claims().get(claim_key(slug, number)) or {}, "policy": "lbf-source-policy-v4", "textualBasis": "OSHB/WLC", "model": TEAM_MODEL, "reasoningEffort": TEAM_REASONING, "precedents": human_precedents(slug), "precedentBoundary": "Human adjudication memory guides reviewers only. It is never model evidence and never overrides the canonical source packet.", "recoveryNote": recovered.get("note") if isinstance(recovered, dict) else "", "verses": rows}


def _run(args: list[str]) -> None:
    result = subprocess.run(args, cwd=ROOT, text=True, capture_output=True, check=False)
    if result.returncode not in {0, 1}:
        raise RuntimeError((result.stderr or result.stdout or "Pipeline command failed").strip())


def prepare(name, slug, chapter, token="") -> None:
    person = authorize(name, token)
    book, number, _ = chapter_or_raise(slug, chapter)
    with _lock:
        _, key = assert_holder(person, slug, number)
        if _alive(key):
            raise ValueError("This chapter is already being prepared.")
        if sum(_alive(item) for item in _threads) >= MAX_RUNNING:
            raise ValueError("All preparation workers are occupied.")
        event = threading.Event()
        _stops[key] = event
        _threads[key] = threading.Thread(target=_prepare, args=(book.slug, number, event), daemon=True)
        claims = load_claims(); claims[key].update(running=True, note="Preparing GPT gates", updated=now()); save_claims(claims)
        _threads[key].start()


def _prepare(slug: str, chapter: int, event: threading.Event) -> None:
    key, error = claim_key(slug, chapter), ""
    try:
        for verse in list_verses(slug, chapter):
            if event.is_set(): break
            with _lock:
                claims = load_claims(); claims[key].update(verse=verse, note=f"Preparing {chapter}:{verse}", updated=now()); save_claims(claims)
            # Rebuild the derived packet from pinned sources. A stale packet
            # from an earlier policy must never reach GPT-5.6 Sol.
            _run([sys.executable, str(PIPELINE / "build_source_packet.py"), slug, str(chapter), str(verse)])
            path = pipeline_dir(slug) / f"{slug}-{chapter}-{verse}.draft-team-gpt.json"
            candidate = read_json(path, {})
            if candidate.get("schema") == "lbf-human-reviewed-candidate-v1": continue
            packet = read_json(packet_path(slug, chapter, verse), {})
            if not path.is_file() or candidate.get("model") != TEAM_MODEL or candidate.get("reasoningEffort") != TEAM_REASONING or candidate.get("packetSha256") != packet_fingerprint(packet):
                _run([sys.executable, str(PIPELINE / "draft_gpt.py"), slug, str(chapter), str(verse), "--label", "team-gpt"])
                path = pipeline_dir(slug) / f"{slug}-{chapter}-{verse}.draft-team-gpt.json"; candidate = read_json(path, {})
            label = label_for(candidate, path); folder = pipeline_dir(slug)
            audit = folder / f"{slug}-{chapter}-{verse}.audit-gpt-{label}.json"
            check = folder / f"{slug}-{chapter}-{verse}.spanish-check-{label}.json"
            audit_data, check_data = read_json(audit, {}), read_json(check, {})
            fingerprint = object_fingerprint(candidate)
            if audit_data.get("model") != TEAM_MODEL or audit_data.get("reasoningEffort") != TEAM_REASONING or audit_data.get("candidateSha256") != fingerprint: _run([sys.executable, str(PIPELINE / "audit_gpt.py"), slug, str(chapter), str(verse), "--candidate-file", str(path), "--label", label])
            if check_data.get("model") != TEAM_MODEL or check_data.get("reasoningEffort") != TEAM_REASONING or check_data.get("candidateSha256") != fingerprint: _run([sys.executable, str(PIPELINE / "spanish_check_gpt.py"), slug, str(chapter), str(verse), "--candidate-file", str(path), "--label", label])
    except Exception as exc:  # noqa: BLE001
        error = str(exc)
    with _lock:
        claims = load_claims()
        if key in claims:
            claims[key].update(running=False, note=(f"Preparation stopped: {error}" if error else ("Preparation stopped" if event.is_set() else "Ready for human review")), updated=now()); save_claims(claims)


def stop(name, slug, chapter, token="") -> None:
    person = authorize(name, token); book, number, _ = chapter_or_raise(slug, chapter)
    with _lock:
        _, key = assert_holder(person, book.slug, number)
        if key in _stops: _stops[key].set()


def validate_units(packet: dict, units, spanish: str = "") -> list[dict]:
    if not isinstance(units, list) or not units: raise ValueError("Alignment units are required.")
    allowed = {str(t.get("sourceTokenId")) for t in packet.get("tokens") or []}; covered = set(); clean = []
    for unit in units:
        surface = " ".join(str((unit or {}).get("es") or "").split()); ids = [str(x) for x in ((unit or {}).get("sourceTokenIds") or [])]
        if not surface or not ids: raise ValueError("Every alignment unit needs Spanish and source tokens.")
        if set(ids) - allowed: raise ValueError("An alignment unit contains an unknown source token.")
        covered.update(ids); clean.append({"es": surface, "sourceTokenIds": ids})
    if allowed - covered: raise ValueError("The alignment omits source tokens: " + ", ".join(sorted(allowed - covered)))
    if spanish:
        words = lambda value: [x.casefold() for x in re.findall(r"\w+", value, re.UNICODE)]
        if words(" ".join(unit["es"] for unit in clean)) != words(spanish):
            raise ValueError("The ordered alignment units do not reproduce the complete approved Spanish wording.")
    return clean


def invalidate_status(slug: str) -> None:
    lines = STATUS.read_text(encoding="utf-8").splitlines(); found = False
    for index, line in enumerate(lines):
        if not line.startswith("| "): continue
        cells = [x.strip() for x in line[1:-1].split("|")]
        if len(cells) != len(STATUS_COLUMNS) or cells[0] != slug: continue
        found = True; row = dict(zip(STATUS_COLUMNS, cells, strict=True))
        row.update(translation="draft", translation_by="", translation_on="", alignment_by="", alignment_on="")
        if row["alignment"] != "none": row["alignment"] = "draft"
        lines[index] = "| " + " | ".join(row[key] for key in STATUS_COLUMNS) + " |"; break
    if not found: raise ValueError(f"{slug} is not in STATUS.md")
    STATUS.write_text("\n".join(lines) + "\n", encoding="utf-8")


def approve_verse(payload: dict) -> dict:
    person = authorize(payload.get("name"), payload.get("token")); book, chapter, verses = chapter_or_raise(payload.get("book"), payload.get("chapter")); verse = int(payload.get("verse") or 0)
    if verse not in verses: raise ValueError("That verse is not in this Protestant chapter.")
    with _lock:
        assert_holder(person, book.slug, chapter)
        save_review_attempt(book, chapter, verse, person, payload)
        packet = read_json(packet_path(book.slug, chapter, verse), {})
        if packet.get("sourcePolicy") != "lbf-source-policy-v4" or packet.get("evidenceStatus") != "READY_FOR_MODEL": raise ValueError("The canonical packet is not READY_FOR_MODEL under lbf-source-policy-v4.")
        if not payload.get("sourceConfirmed"): raise ValueError("Confirm the complete source-evidence review.")
        if not payload.get("alignmentConfirmed"): raise ValueError("Confirm every visible Spanish-to-source link.")
        spanish = " ".join(str(payload.get("spanish") or "").split()); units = validate_units(packet, payload.get("units"), spanish)
        if not spanish: raise ValueError("Spanish text is required.")
        name_findings = [*lint_spanish(spanish), *lint_divine_name(spanish, packet)]
        if name_findings:
            raise ValueError("Divine-name standard failed: " + "; ".join(item["issue"] for item in name_findings))
        prior_path = candidate_path(book.slug, chapter, verse); prior = read_json(prior_path, {}) if prior_path else {}; decision = " ".join(str(payload.get("decision") or "").split())
        if prior.get("schema") != "lbf-human-reviewed-candidate-v1":
            if prior.get("model") != TEAM_MODEL:
                raise ValueError("This candidate is not proven to have been drafted by GPT-5.6 Sol. Prepare the chapter first.")
            if prior.get("reasoningEffort") != TEAM_REASONING:
                raise ValueError("This candidate was not drafted with the required medium reasoning effort. Prepare the chapter again.")
            if prior.get("packetSha256") != packet_fingerprint(packet):
                raise ValueError("This candidate is not bound to the current canonical packet. Prepare the chapter again.")
            gate = gate_for(book.slug, chapter, verse, prior_path, prior)
            if gate["fidelity"] == "missing" or gate["spanish"] == "missing":
                raise ValueError("Both independent GPT-5.6 Sol gates must run before human adjudication.")
            if gate["auditModel"] != TEAM_MODEL or gate["spanishModel"] != TEAM_MODEL:
                raise ValueError("Both independent gates must be executed by GPT-5.6 Sol.")
            if gate["auditReasoning"] != TEAM_REASONING or gate["spanishReasoning"] != TEAM_REASONING:
                raise ValueError("Both independent gates must use the required medium reasoning effort.")
            if not decision and (gate["fidelity"] != "pass" or gate["spanish"] != "pass" or prior.get("uncertainties")):
                issues = [str(x.get("issue") or "").strip() for x in [*(gate.get("fidelityFindings") or []), *(gate.get("spanishFindings") or []), *(prior.get("uncertainties") or [])] if isinstance(x, dict) and str(x.get("issue") or "").strip()]
                summary = "; ".join(issues) or "the model-raised uncertainty or failed gate"
                decision = f"{person} explicitly accepted this wording after reviewing the canonical evidence and adjudicated: {summary}"
        artifact = {"schema": "lbf-human-reviewed-candidate-v1", "book": book.slug, "reference": f"{book.label} {chapter}:{verse}", "chapter": chapter, "verse": verse, "spanish": spanish, "units": units, "adjudication": {"status": "approved", "decision": decision or "The named reviewer confirmed the wording against the complete canonical packet.", "reviewedBy": person, "reviewedOn": today(), "humanApprovedInTeamDesk": True, "sourceEvidenceConfirmed": True, "alignmentUnitsConfirmed": True, "scope": "verse wording and alignment seed; not STATUS.md done approval"}}
        current_path = translation_file(book.slug)
        current_text = current_path.read_text(encoding="utf-8") if current_path.is_file() else ""
        changed = verse_body(current_text, chapter, verse) != spanish
        if changed:
            invalidate_status(book.slug)
            write_verse(book.slug, chapter, verse, spanish)
        write_json(human_path(book.slug, chapter, verse), artifact)
        claims, key = assert_holder(person, book.slug, chapter); claims[key].update(verse=verse, note=f"Approved {chapter}:{verse}; alignment seed confirmed", updated=now()); save_claims(claims)
    return chapter_view(book.slug, chapter)


def finish_chapter(payload: dict) -> dict:
    person = authorize(payload.get("name"), payload.get("token")); book, chapter, verses = chapter_or_raise(payload.get("book"), payload.get("chapter"))
    if not payload.get("contextConfirmed"): raise ValueError("Confirm the complete chapter continuity, voice, and flow review.")
    with _lock:
        claims, key = assert_holder(person, book.slug, chapter); missing = [v for v in verses if not human_path(book.slug, chapter, v).is_file()]
        if missing: raise ValueError("Human review is missing for verse(s): " + ", ".join(map(str, missing)))
        write_json(pipeline_dir(book.slug) / f"{book.slug}-{chapter}.human-review.json", {"schema": "lbf-human-chapter-review-v1", "book": book.slug, "chapter": chapter, "reviewedBy": person, "reviewedOn": today(), "continuityVoiceFlowConfirmed": True, "verseWordingConfirmed": verses, "alignmentSeedsConfirmed": verses, "statusScope": "chapter review only; not STATUS.md done and not canonical alignment"})
        write_json(pipeline_dir(book.slug) / f"{book.slug}-{chapter}.alignment-seed.json", {"schema": "lbf-alignment-seed-manifest-v1", "book": book.slug, "chapter": chapter, "status": "seeded-hand", "canonicalAlignmentChanged": False, "instruction": "Named reviewers confirmed these visible unit links. They remain a noncanonical seed until copied into and validated in the canonical reverse-links file.", "verses": [{"verse": v, "candidate": human_path(book.slug, chapter, v).name, "confirmed": True} for v in verses]})
        claims[key].update(note="Chapter review complete; canonical alignment still pending", updated=now()); save_claims(claims)
    return chapter_view(book.slug, chapter)


def chapter_count(slug: str) -> int:
    if slug not in _chapter_counts:
        # The Markdown headings use Protestant numbering and make a cheap UI
        # index. Source existence is still checked by chapter_or_raise.
        path = translation_file(slug)
        headings = [int(x) for x in re.findall(r"^## Capítulo (\d+)\s*$", path.read_text(encoding="utf-8"), re.MULTILINE)] if path.is_file() else []
        count = max(headings, default=0)
        _chapter_counts[slug] = count
    return _chapter_counts[slug]


def board() -> dict:
    return {"model": model_name(), "reasoningEffort": reasoning_effort(), "sourcePolicy": "lbf-source-policy-v4", "textualBasis": "OSHB/WLC", "maxRunning": MAX_RUNNING, "running": sum(_alive(k) for k in _threads), "people": sorted(load_people()), "books": [{"slug": b.slug, "label": b.label, "chapters": chapter_count(b.slug)} for b in OT], "claims": load_claims(), "ntBlocked": True}


def warm_totals() -> None:
    for book in OT: chapter_count(book.slug)
