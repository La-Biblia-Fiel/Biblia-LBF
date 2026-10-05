#!/usr/bin/env python3
"""Unattended chapter pass. Cursor Auto audits. Sonnet repairs once.

Calls the Cursor CLI (`agent`). A person reads the chapter and the parked
list when the command has finished. This script does not sign STATUS.md.

    python3 tools/pipeline/auto_pass.py exodo 1
    python3 tools/pipeline/auto_pass.py exodo 1 --from 1 --to 5

Spanish already in translation/ is audited. A clean pass stays. A fail or
a warn goes to Sonnet once. Auto audits that Spanish again. Verdict pass
is written into the verse (warns stay in the audit for the later read).
Verdict fail, or a lint hit that remains, parks the verse and leaves the
previous Spanish.

Install the CLI, then log in, if `agent` is not on PATH:

    curl https://cursor.com/install -fsS | bash
    agent login
    agent models

LBF_CURSOR_AUTO_MODEL defaults to auto.
LBF_CURSOR_SONNET_MODEL defaults to claude-sonnet-5
(or LBF_SONNET_MODEL when that is set). Use an id from `agent models`
when the CLI rejects the default.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import env_load  # noqa: F401
from audit_lib import (
    SYSTEM as AUDIT_SYSTEM,
    audit_path,
    build_user_prompt as audit_user,
    normalize_audit,
)
from books import ROOT, get_book
from cursor_auto import ensure_packet
from draft_lib import (
    build_user_prompt as draft_user,
    draft_path,
    load_system as draft_system,
    normalize_draft,
    parse_json_object,
)
from lint_lib import lint_path, lint_spanish
from polish_lib import (
    build_user_prompt as polish_user,
    load_system as polish_system,
    normalize_polish,
    polish_path,
)
from source_packet import list_verses

VERSE_HEADING = re.compile(r"^###\s+(\d+):(\d+)\s*$")
LBF_LABEL = "lbf"
POLISH_LABEL = "pulir"
SONNET_LABEL = "sonnet5"
AUTO_LABEL = "auto"
MISSING_CLI = """Cursor CLI not found (looked for agent and cursor-agent).
Install: curl https://cursor.com/install -fsS | bash
Then: agent login
auto_pass.py calls Cursor Auto and Sonnet through that CLI.
"""


def auto_model() -> str:
    return os.environ.get("LBF_CURSOR_AUTO_MODEL", "auto")


def sonnet_model() -> str:
    return (
        os.environ.get("LBF_CURSOR_SONNET_MODEL")
        or os.environ.get("LBF_SONNET_MODEL")
        or "claude-sonnet-5"
    )


def agent_binary() -> str | None:
    override = os.environ.get("LBF_CURSOR_AGENT", "").strip()
    if override and Path(override).is_file():
        return override
    for name in ("agent", "cursor-agent"):
        found = shutil.which(name)
        if found:
            return found
    local = Path.home() / ".local" / "bin" / "agent"
    if local.is_file():
        return str(local)
    return None


def translation_path(slug: str) -> Path:
    book = get_book(slug)
    return ROOT / "translation" / book.testament / f"{book.slug}.md"


def report_path(slug: str, chapter: int) -> Path:
    book = get_book(slug)
    return (
        ROOT
        / "pipeline"
        / book.testament
        / book.slug
        / "_logs"
        / f"{book.slug}-{chapter}.auto-pass.json"
    )


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read_json(path: Path) -> dict | None:
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def request_for(artifact: Path) -> Path:
    name = artifact.name
    if not name.endswith(".json"):
        raise ValueError(name)
    return artifact.with_name(name[:-5] + ".request.json")


def reply_for(request: Path) -> Path:
    return request.with_name(request.name.replace(".request.json", ".reply.json"))


def unwrap(raw: dict, key: str) -> dict:
    inner = raw.get(key)
    return inner if isinstance(inner, dict) else raw


def parse_verses(text: str) -> dict[tuple[int, int], str]:
    verses: dict[tuple[int, int], str] = {}
    cur: tuple[int, int] | None = None
    buf: list[str] = []
    for line in text.splitlines():
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


def load_verses(slug: str) -> dict[tuple[int, int], str]:
    path = translation_path(slug)
    if not path.is_file():
        return {}
    return parse_verses(path.read_text(encoding="utf-8"))


def warn_count(audit: dict | None) -> int:
    return sum(1 for item in (audit or {}).get("findings") or [] if item.get("severity") == "warn")


def is_clean(audit: dict | None) -> bool:
    return bool(audit) and audit.get("verdict") == "pass" and warn_count(audit) == 0


def matching(doc: dict | None, spanish: str) -> dict | None:
    if doc and doc.get("spanish") == spanish:
        return doc
    return None


def apply_names(text: str) -> str:
    spec_path = ROOT / "tools" / "remap_proper_names.py"
    import importlib.util

    spec = importlib.util.spec_from_file_location("remap_proper_names", spec_path)
    if spec is None or spec.loader is None:
        return text
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.apply_names(text)[0]


def call_cursor(model: str, request: Path) -> dict:
    binary = agent_binary()
    if not binary:
        raise RuntimeError(MISSING_CLI.strip())
    prompt = (
        "Read the JSON file at this absolute path and answer it:\n"
        f"{request}\n\n"
        "Follow the system and user fields in that file. "
        "The packet inside the file is the only evidence. "
        "Return only the JSON object those fields require. "
        "No markdown fences. Do not write files. Do not edit the repository. "
        "Do not align. Do not open STATUS.md."
    )
    timeout = int(os.environ.get("LBF_CURSOR_TIMEOUT", "300"))
    proc = subprocess.run(
        [
            binary,
            "-p",
            "--trust",
            "--mode",
            "ask",
            "--model",
            model,
            "--output-format",
            "text",
            "--workspace",
            str(ROOT),
            prompt,
        ],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "").strip()
        hint = ""
        if "model" in detail.lower():
            hint = " Run `agent models` and set LBF_CURSOR_AUTO_MODEL or LBF_CURSOR_SONNET_MODEL."
        raise RuntimeError(f"agent exit {proc.returncode}: {detail[-800:]}{hint}")
    if not (proc.stdout or "").strip():
        raise RuntimeError("agent returned an empty answer")
    return parse_json_object(proc.stdout)


def write_role_request(path: Path, *, model: str, system: str, user: str, extra: dict) -> Path:
    payload = {
        "model": model,
        "system": system,
        "user": user,
        "replyPath": str(reply_for(path)),
    }
    payload.update(extra)
    write_json(path, payload)
    return path


def ask(caller, model: str, request: Path, key: str) -> dict:
    raw = caller(model, request)
    write_json(reply_for(request), raw)
    return unwrap(raw, key)


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


def load_audit(slug: str, chapter: int, verse: int, label: str, spanish: str) -> dict | None:
    return matching(read_json(audit_path(slug, chapter, verse, label)), spanish)


def audit_spanish(
    slug: str,
    chapter: int,
    verse: int,
    packet: dict,
    spanish: str,
    label: str,
    caller,
    *,
    reuse: bool = True,
) -> dict:
    if reuse:
        stored = load_audit(slug, chapter, verse, label, spanish)
        if stored:
            return stored
    artifact = audit_path(slug, chapter, verse, label)
    request = write_role_request(
        request_for(artifact),
        model=auto_model(),
        system=AUDIT_SYSTEM,
        user=audit_user(packet, spanish, label),
        extra={
            "auditor": "cursor-auto",
            "book": slug,
            "chapter": chapter,
            "verse": verse,
            "spanish": spanish,
            "instruction": (
                "Judge source fidelity. Do not rewrite. "
                "Cite sourceTokenIds from the packet or the finding is discarded."
            ),
        },
    )
    raw = ask(caller, auto_model(), request, "audit")
    audit = normalize_audit(raw, packet, spanish, label, auditor="Cursor Auto")
    write_json(artifact, audit)
    return audit


def draft_for(slug: str, chapter: int, verse: int, spanish: str) -> dict:
    stored = read_json(draft_path(slug, chapter, verse, AUTO_LABEL))
    if stored and stored.get("spanish") == spanish:
        return stored
    return {"spanish": spanish, "units": [], "uncertainties": [], "addedConcepts": []}


def ensure_draft(
    slug: str, chapter: int, verse: int, packet: dict, caller, *, reuse: bool = True
) -> str:
    stored = read_json(draft_path(slug, chapter, verse, AUTO_LABEL)) if reuse else None
    if stored and str(stored.get("spanish") or "").strip():
        return apply_names(str(stored["spanish"]).strip())
    artifact = draft_path(slug, chapter, verse, AUTO_LABEL)
    request = write_role_request(
        request_for(artifact),
        model=auto_model(),
        system=draft_system(),
        user=draft_user(packet),
        extra={
            "book": slug,
            "chapter": chapter,
            "verse": verse,
            "instruction": "Draft from the packet only. Do not audit. Do not polish.",
        },
    )
    raw = ask(caller, auto_model(), request, "draft")
    draft = normalize_draft(raw, packet, AUTO_LABEL)
    spanish = apply_names(str(draft.get("spanish") or "").strip())
    draft["spanish"] = spanish
    if spanish:
        write_json(artifact, draft)
    return spanish


def repair(
    slug: str,
    chapter: int,
    verse: int,
    packet: dict,
    original: str,
    audit: dict | None,
    lint_findings: list,
    caller,
    *,
    reuse: bool = True,
) -> dict:
    artifact = polish_path(slug, chapter, verse, SONNET_LABEL)
    stored = read_json(artifact) if reuse else None
    if stored and stored.get("sourceDraft") == original and str(stored.get("spanish") or "").strip():
        return stored
    draft = draft_for(slug, chapter, verse, original)
    findings = list(lint_findings)
    if audit:
        findings.extend(audit.get("findings") or [])
    audit_for_prompt = audit or {
        "verdict": "fail" if lint_findings else "pass",
        "findings": lint_findings,
        "notes": "local lint; Cursor Auto has not audited this Spanish yet",
        "spanish": original,
    }
    request = write_role_request(
        request_for(artifact),
        model=sonnet_model(),
        system=polish_system(),
        user=polish_user(packet, draft, audit_for_prompt),
        extra={
            "book": slug,
            "chapter": chapter,
            "verse": verse,
            "why": "questionable",
            "findings": findings,
            "instruction": (
                "This verse is questionable. Repair only the cited mismatches "
                "and grammar. Return the polish JSON object."
            ),
        },
    )
    raw = ask(caller, sonnet_model(), request, "polish")
    polish = normalize_polish(raw, packet, draft, SONNET_LABEL)
    polish["spanish"] = apply_names(str(polish.get("spanish") or "").strip())
    polish["sourceDraft"] = original
    write_json(artifact, polish)
    return polish


def row(
    verse: int,
    status: str,
    *,
    applied: bool = False,
    warns: int = 0,
    notes: str = "",
    spanish: str = "",
    drafted: bool = False,
    findings: list | None = None,
) -> dict:
    return {
        "verse": verse,
        "status": status,
        "applied": applied,
        "warns": warns,
        "notes": notes,
        "spanish": spanish,
        "drafted": drafted,
        "findings": findings or [],
    }


def next_section(lines: list[str], start: int) -> int:
    for index in range(start, len(lines)):
        if lines[index].startswith("### ") or lines[index].startswith("## "):
            return index
    return len(lines)


def write_verse(slug: str, chapter: int, verse: int, spanish: str) -> bool:
    path = translation_path(slug)
    spanish = spanish.strip()
    if not spanish:
        return False
    if not path.is_file():
        book = get_book(slug)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            f"# {book.label}\n\n## Capítulo {chapter}\n\n### {chapter}:{verse}\n\n{spanish}\n",
            encoding="utf-8",
        )
        return True
    lines = path.read_text(encoding="utf-8").splitlines()
    heading = f"### {chapter}:{verse}"
    for index, line in enumerate(lines):
        if line.strip() != heading:
            continue
        end = next_section(lines, index + 1)
        body = " ".join(
            item.strip()
            for item in lines[index + 1 : end]
            if item.strip() and not item.startswith("#") and not item.startswith(">")
        ).strip()
        if body == spanish:
            return False
        updated = lines[:index] + [heading, "", spanish, ""] + lines[end:]
        path.write_text("\n".join(updated).rstrip() + "\n", encoding="utf-8")
        return True
    block = ["", heading, "", spanish, ""]
    inserted = False
    updated: list[str] = []
    for line in lines:
        match = VERSE_HEADING.match(line)
        if (
            not inserted
            and match
            and int(match.group(1)) == chapter
            and int(match.group(2)) > verse
        ):
            updated.extend(block)
            inserted = True
        if not inserted and line.startswith("## ") and inserted_before_later_chapter(line, chapter):
            updated.extend(block)
            inserted = True
        updated.append(line)
    if not inserted:
        updated.extend(block)
    path.write_text("\n".join(updated).rstrip() + "\n", encoding="utf-8")
    return True


def inserted_before_later_chapter(line: str, chapter: int) -> bool:
    match = re.match(r"^## Capítulo\s+(\d+)\s*$", line)
    return bool(match and int(match.group(1)) > chapter)


def run_verse(
    slug: str,
    chapter: int,
    verse: int,
    *,
    resume: bool = True,
    full: bool = False,
    caller=None,
) -> dict:
    caller = caller or call_cursor
    packet = ensure_packet(slug, chapter, verse)
    original = load_verses(slug).get((chapter, verse), "").strip()
    drafted = False
    if not original:
        original = ensure_draft(slug, chapter, verse, packet, caller, reuse=resume)
        drafted = True
        if not original:
            return row(verse, "error", notes="empty draft")

    polish = read_json(polish_path(slug, chapter, verse, SONNET_LABEL)) if resume else None
    polish_spanish = str((polish or {}).get("spanish") or "").strip()
    if polish and polish_spanish == original and polish.get("sourceDraft") not in (None, original):
        return finish_current(slug, chapter, verse, packet, original, caller, resume=resume)
    if polish and polish_spanish == original and polish.get("sourceDraft") == original:
        return unchanged(slug, chapter, verse, original)

    lint_findings = lint_spanish(original)
    record_lint(slug, chapter, verse, original, lint_findings)
    audit = None
    if not lint_findings:
        if resume:
            audit = load_audit(slug, chapter, verse, LBF_LABEL, original)
        if audit is None:
            audit = audit_spanish(
                slug, chapter, verse, packet, original, LBF_LABEL, caller, reuse=resume
            )

    questionable = bool(lint_findings) or not is_clean(audit)
    if full:
        questionable = True
    if not questionable:
        applied = write_verse(slug, chapter, verse, original) if drafted else False
        status = "drafted" if drafted else "kept"
        return row(verse, status, applied=applied, spanish=original, drafted=drafted)

    repaired = repair(
        slug,
        chapter,
        verse,
        packet,
        original,
        audit,
        lint_findings,
        caller,
        reuse=resume,
    )
    spanish = str(repaired.get("spanish") or "").strip()
    if not spanish:
        return row(verse, "error", notes="empty Sonnet answer", drafted=drafted)
    if spanish == original and not drafted:
        notes = "Sonnet left this Spanish unchanged"
        if lint_findings or not is_clean(audit):
            return row(
                verse,
                "parked",
                notes=notes,
                warns=warn_count(audit),
                spanish=original,
                findings=(audit or {}).get("findings") or lint_findings,
            )
        return row(verse, "kept", notes=notes, spanish=original)

    polish_lint = lint_spanish(spanish)
    record_lint(slug, chapter, verse, spanish, polish_lint)
    if polish_lint:
        return row(
            verse,
            "parked",
            notes="Sonnet left a lint failure",
            spanish=spanish,
            drafted=drafted,
            findings=polish_lint,
        )

    second = load_audit(slug, chapter, verse, POLISH_LABEL, spanish) if resume else None
    if second is None:
        second = audit_spanish(
            slug, chapter, verse, packet, spanish, POLISH_LABEL, caller, reuse=resume
        )
    if second.get("verdict") == "fail":
        return row(
            verse,
            "parked",
            notes="re-audit fail",
            spanish=spanish,
            drafted=drafted,
            findings=second.get("findings") or [],
        )
    applied = write_verse(slug, chapter, verse, spanish)
    return row(
        verse,
        "repaired",
        applied=applied,
        warns=warn_count(second),
        spanish=spanish,
        drafted=drafted,
        findings=second.get("findings") or [],
    )


def unchanged(slug: str, chapter: int, verse: int, spanish: str) -> dict:
    """Sonnet already returned this same line. Do not call a model again."""
    notes = "Sonnet left this Spanish unchanged"
    lint_findings = lint_spanish(spanish)
    audit = load_audit(slug, chapter, verse, LBF_LABEL, spanish)
    if lint_findings or not is_clean(audit):
        return row(
            verse,
            "parked",
            notes=notes,
            warns=warn_count(audit),
            spanish=spanish,
            findings=(audit or {}).get("findings") or lint_findings,
        )
    return row(verse, "kept", notes=notes, spanish=spanish)


def finish_current(
    slug: str,
    chapter: int,
    verse: int,
    packet: dict,
    spanish: str,
    caller,
    *,
    resume: bool,
) -> dict:
    """The book line is already Sonnet's Spanish. Re-audit once if needed."""
    lint_findings = lint_spanish(spanish)
    record_lint(slug, chapter, verse, spanish, lint_findings)
    if lint_findings:
        return row(
            verse,
            "parked",
            notes="Sonnet left a lint failure",
            spanish=spanish,
            findings=lint_findings,
        )
    second = load_audit(slug, chapter, verse, POLISH_LABEL, spanish) if resume else None
    if second is None:
        second = audit_spanish(slug, chapter, verse, packet, spanish, POLISH_LABEL, caller)
    if second.get("verdict") == "fail":
        return row(
            verse,
            "parked",
            notes="re-audit fail",
            spanish=spanish,
            findings=second.get("findings") or [],
        )
    return row(
        verse,
        "kept",
        warns=warn_count(second),
        notes="already Sonnet's Spanish",
        spanish=spanish,
        findings=second.get("findings") or [],
    )


def chapter_verses(slug: str, chapter: int, start: int, end: int | None) -> list[int]:
    numbers = list_verses(slug, chapter)
    return [verse for verse in numbers if verse >= start and (end is None or verse <= end)]


def run_auto(
    slug: str,
    chapter: int,
    *,
    start: int = 1,
    end: int | None = None,
    resume: bool = True,
    full: bool = False,
    caller=None,
) -> dict:
    summary = {
        "book": slug,
        "chapter": chapter,
        "kept": [],
        "drafted": [],
        "repaired": [],
        "repairedWithWarn": [],
        "parked": [],
        "errors": [],
    }
    rows = []
    for verse in chapter_verses(slug, chapter, start, end):
        try:
            result = run_verse(
                slug, chapter, verse, resume=resume, full=full, caller=caller
            )
        except Exception as exc:  # noqa: BLE001
            result = row(verse, "error", notes=str(exc))
        rows.append(result)
        print(
            f"{chapter}:{verse}: {result['status']} warns={result.get('warns') or 0} "
            f"{result.get('notes') or ''}".rstrip(),
            flush=True,
        )
        status = result["status"]
        if status == "kept":
            summary["kept"].append(verse)
        elif status == "drafted":
            summary["drafted"].append(verse)
        elif status == "repaired":
            bucket = "repairedWithWarn" if result.get("warns") else "repaired"
            summary[bucket].append(verse)
        elif status == "parked":
            summary["parked"].append(
                {
                    "verse": verse,
                    "notes": result.get("notes") or "",
                    "spanish": result.get("spanish") or "",
                    "findings": result.get("findings") or [],
                }
            )
        else:
            summary["errors"].append({"verse": verse, "error": result.get("notes") or "error"})

    payload = {
        "schema": "lbf-auto-pass-v1",
        "book": slug,
        "chapter": chapter,
        "kept": summary["kept"],
        "drafted": summary["drafted"],
        "repaired": summary["repaired"],
        "repairedWithWarn": summary["repairedWithWarn"],
        "parked": summary["parked"],
        "errors": summary["errors"],
    }
    path = report_path(slug, chapter)
    write_json(path, payload)
    summary["report"] = str(path)
    print(json.dumps(summary, ensure_ascii=False), flush=True)
    return summary


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("book")
    parser.add_argument("chapter", type=int)
    parser.add_argument("--from", dest="start", type=int, default=1)
    parser.add_argument("--to", dest="end", type=int, default=None)
    parser.add_argument(
        "--no-resume",
        action="store_true",
        help="Ignore stored audits and call Auto and Sonnet again",
    )
    parser.add_argument(
        "--full",
        action="store_true",
        help="Send every verse to Sonnet, including a clean pass",
    )
    args = parser.parse_args(argv)
    if agent_binary() is None:
        print(MISSING_CLI, file=sys.stderr)
        return 2
    summary = run_auto(
        args.book,
        args.chapter,
        start=args.start,
        end=args.end,
        resume=not args.no_resume,
        full=args.full,
    )
    return 1 if summary["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
