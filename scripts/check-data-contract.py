#!/usr/bin/env python3
"""
Biblia-LBF boundary check.

Derived from DATA_CONTRACT.md (normative) and
docs/architecture/CGV_DATA_ARCHITECTURE.md.

READ-ONLY. This script never creates, modifies, moves or deletes repository
data. It only reads files and prints findings. `--emit-baseline` writes JSON to
stdout; it does not write any file itself.

Exit codes:
  0  no new violations
  1  new violations found (not present in the baseline)
  2  usage or internal error
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

REPO_NAME = "Biblia-LBF"
BASELINE_FILENAME = ".data-contract-baseline.json"

# --------------------------------------------------------------------------
# findings
# --------------------------------------------------------------------------

FINDINGS: list[dict] = []


def add(rule: str, path: str, message: str, key: str = "") -> None:
    """Record one finding. `key` makes the identity stable across reruns."""
    FINDINGS.append(
        {
            "id": f"{rule}|{path}|{key}",
            "rule": rule,
            "path": path,
            "key": key,
            "message": message,
        }
    )


NOTES: list[str] = []


def note(message: str) -> None:
    NOTES.append(message)


# --------------------------------------------------------------------------
# tiny JSON Schema subset validator (stdlib only, no jsonschema dependency)
# supports: type, required, properties, items, enum, pattern, minItems,
#           additionalProperties: false
# --------------------------------------------------------------------------

TYPES = {
    "object": dict,
    "array": list,
    "string": str,
    "number": (int, float),
    "integer": int,
    "boolean": bool,
    "null": type(None),
}


def validate(instance, schema, where="$") -> list[str]:
    errors: list[str] = []
    expected = schema.get("type")
    if expected:
        wanted = TYPES.get(expected)
        if wanted is None:
            return errors
        if expected == "integer" and isinstance(instance, bool):
            errors.append(f"{where}: expected integer, got boolean")
            return errors
        if not isinstance(instance, wanted):
            errors.append(f"{where}: expected {expected}, got {type(instance).__name__}")
            return errors
    if "enum" in schema and instance not in schema["enum"]:
        errors.append(f"{where}: {instance!r} not one of {schema['enum']}")
    if "pattern" in schema and isinstance(instance, str):
        if not re.search(schema["pattern"], instance):
            errors.append(f"{where}: {instance!r} does not match /{schema['pattern']}/")
    if isinstance(instance, dict):
        for field in schema.get("required", []):
            if field not in instance:
                errors.append(f"{where}: missing required property '{field}'")
        props = schema.get("properties", {})
        for name, value in instance.items():
            if name in props:
                errors.extend(validate(value, props[name], f"{where}.{name}"))
            elif schema.get("additionalProperties") is False:
                errors.append(f"{where}: unexpected property '{name}'")
    if isinstance(instance, list):
        if "minItems" in schema and len(instance) < schema["minItems"]:
            errors.append(f"{where}: expected at least {schema['minItems']} items")
        item_schema = schema.get("items")
        if item_schema:
            for index, item in enumerate(instance):
                errors.extend(validate(item, item_schema, f"{where}[{index}]"))
    return errors


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

SKIP_DIRS = {".git", "node_modules", ".venv", "site/public", "__pycache__"}


def walk(repo: Path):
    for dirpath, dirnames, filenames in os.walk(repo):
        rel_dir = Path(dirpath).relative_to(repo).as_posix()
        dirnames[:] = [
            d
            for d in dirnames
            if d not in SKIP_DIRS
            and (rel_dir == "." and d or f"{rel_dir}/{d}") not in SKIP_DIRS
        ]
        for name in filenames:
            if name == ".DS_Store":
                continue
            yield (Path(dirpath) / name).relative_to(repo)


def tracked_files(repo: Path) -> list[Path]:
    """
    Files as CI sees them: git-tracked only. An untracked scratch copy, a local
    worktree or an ignored build directory is not part of the repository and must
    not affect the result.
    """
    try:
        result = subprocess.run(
            ["git", "-C", str(repo), "ls-files", "-z"],
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError:
        result = None
    if result is None or result.returncode != 0:
        note("Not a git checkout; falling back to a filesystem walk.")
        return list(walk(repo))
    return [
        Path(entry)
        for entry in result.stdout.split("\0")
        if entry and not entry.endswith(".DS_Store")
    ]


def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001 - reported, not raised
        return exc


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


# --------------------------------------------------------------------------
# boundary rules (what may live in this repository at all)
# --------------------------------------------------------------------------

# Reader / Observer / Compiler application code does not belong here. The
# Translator application does, under apps/translator/ — see DATA_CONTRACT.md,
# "Translator application". Its location never changes data ownership.
APP_CODE_PATTERNS = [
    re.compile(r"^apps/"),
    re.compile(r"\.(tsx|jsx)$"),
    re.compile(r"^(src|packages)/.*\.(ts|js)$"),
    re.compile(r"vite\.config\.(ts|js)$"),
]
# `site/` is the Hugo publication site; `apps/translator/` is the permitted app.
APP_CODE_ALLOW = re.compile(r"^(site|tools|scripts)/|^apps/translator/")

# Minimal, clearly labelled fixtures are the only data allowed under the app.
TRANSLATOR_FIXTURES = re.compile(r"^apps/translator/tests/fixtures/")
MAX_FIXTURE_BYTES = 64 * 1024

# A second editable corpus beneath the application is the one thing the
# amendment does not permit: it recreates the two-sources-of-truth problem
# inside a single repository.
TRANSLATOR_CORPUS = [
    (
        "TRANSLATOR_CORPUS_TREE",
        re.compile(r"^apps/translator/translations/"),
        "A `translations/` tree under the Translator application is a second "
        "editable corpus. Canonical translation lives in the project's own "
        "translation directories.",
    ),
    (
        "TRANSLATOR_CANONICAL_DATA",
        re.compile(
            r"""(?x)
            ^apps/translator/.*(
              \.lbf\.md$
              | \.alignment\.json$
              | -phrases\.json$
              | -reverse-links(\.[a-z0-9-]+)?\.json$
              | -spine\.json$
              | /release-manifest\.json$
            )"""
        ),
        "Canonical-looking corpus, alignment or release data beneath the "
        "Translator application. The app must operate on the project's "
        "canonical data, not carry its own copy.",
    ),
    (
        "TRANSLATOR_APPROVAL_RECORDS",
        re.compile(r"^apps/translator/.*(approvals?|review-results|review-packets|queues)/"),
        "Approval or review records beneath the Translator application. "
        "Approval truth belongs to the canonical project data.",
    ),
]


def check_translator_app(repo: Path) -> None:
    for rel in tracked_files(repo):
        posix = rel.as_posix()
        if not posix.startswith("apps/translator/"):
            continue
        if TRANSLATOR_FIXTURES.match(posix):
            try:
                size = (repo / rel).stat().st_size
            except OSError:
                size = 0
            if size > MAX_FIXTURE_BYTES:
                add(
                    "OVERSIZED_FIXTURE",
                    posix,
                    f"Fixture is {size // 1024} KiB. Fixtures under the Translator app "
                    f"must be minimal (<= {MAX_FIXTURE_BYTES // 1024} KiB) and clearly "
                    "labelled noncanonical.",
                )
            continue
        for rule, pattern, message in TRANSLATOR_CORPUS:
            if pattern.search(posix):
                add(rule, posix, message)
                break

FOREIGN_BIBLE = re.compile(r"\.(nbla|ble)\.md$|/(NBLA|BLE|SPNBES|RV1909)/")

CROSS_REPO_WRITE = re.compile(
    r"""(?x)
    (open\s*\(|write_text|write_bytes|copyfile|copytree|copy2|move|
     writeFileSync|writeFile|outputFile|rename\s*\()
    [^\n]{0,160}
    (cgv-data|cgv-reader)
    |
    (cgv-data|cgv-reader)[^\n]{0,160}
    (open\s*\(\s*['"][^'"]*['"]\s*,\s*['"][wa]|write_text|writeFileSync)
    """
)

GIT_CROSS_REPO = re.compile(r"git\s+-C\s+[^\s]*(cgv-data|cgv-reader)")


def check_boundaries(repo: Path) -> None:
    books_legacy: dict[str, str] = {}
    books_canonical: dict[str, str] = {}

    for rel in tracked_files(repo):
        posix = rel.as_posix()

        if not APP_CODE_ALLOW.match(posix):
            for pattern in APP_CODE_PATTERNS:
                if pattern.search(posix):
                    add(
                        "APP_CODE_IN_SOURCE_REPO",
                        posix,
                        "Application code is prohibited here. Reader/Observer/Compiler/"
                        "Translator UI belongs in its own repository.",
                    )
                    break

        if FOREIGN_BIBLE.search(posix) and not posix.startswith("site/"):
            add(
                "FOREIGN_BIBLE_COPY",
                posix,
                "Published or unrelated Bible artifacts must not be editable here. "
                "Biblia-LBF owns LBF source only.",
            )

        if posix.startswith("translation/") and posix.endswith(".md"):
            books_legacy[rel.stem] = posix
        canonical = re.match(r"^content/(nt|ot)/([^/]+)/translation\.json$", posix)
        if canonical:
            books_canonical[canonical.group(2).lower()] = posix

        if rel.suffix in {".py", ".js", ".mjs", ".ts", ".sh"}:
            try:
                text = (repo / rel).read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            if CROSS_REPO_WRITE.search(text) or GIT_CROSS_REPO.search(text):
                add(
                    "CROSS_REPO_WRITE",
                    posix,
                    "This file appears to write into cgv-data or cgv-reader. "
                    "Publication is one-way through the exporter and a publisher PR.",
                )

    for book, canonical_path in books_canonical.items():
        for legacy_stem, legacy_path in books_legacy.items():
            if legacy_stem.lower() == book:
                add(
                    "MULTIPLE_CANONICAL_FORMATS",
                    canonical_path,
                    f"'{book}' is editable in two formats at once "
                    f"({legacy_path} and {canonical_path}). Exactly one canonical "
                    "record per verse is allowed.",
                    key=legacy_path,
                )


# --------------------------------------------------------------------------
# data rules
# --------------------------------------------------------------------------

TOKEN_ID = re.compile(r"^([a-z])(\d{2})(\d{3})(\d{3})(\d{3})$")
REVISION_ID = re.compile(r"^(SRC|TR|ALN|BOOKREV|RELMAN)-[a-z0-9]+-[0-9a-f]{12}$")
HEADER_REVISION = re.compile(r"translation-revision:\s*(\S+)")


def record_files(repo: Path) -> list[Path]:
    found = []
    for rel in tracked_files(repo):
        if rel.suffix != ".json":
            continue
        posix = rel.as_posix()
        # Canonical-record checks apply to canonical directories only. Files under
        # apps/ are application data by definition — the Translator rules above
        # own them, and treating an app's copy of a release as a canonical record
        # would report it twice under the wrong rule.
        if posix.startswith(("source/", "site/", "apps/")):
            continue
        found.append(rel)
    return found


def check_records(repo: Path, schema_dir: Path | None = None) -> None:
    schema_dir = schema_dir or (repo / "schema")
    schemas: dict[str, dict] = {}
    if schema_dir.is_dir():
        for schema_path in sorted(schema_dir.glob("*.schema.json")):
            data = load_json(schema_path)
            if isinstance(data, dict):
                schemas[schema_path.name] = data
    else:
        note(
            "schema/ not present: schema validation limited to records that "
            "declare a recordType with a shipped schema."
        )

    seen_record_ids: dict[str, str] = {}

    for rel in record_files(repo):
        posix = rel.as_posix()
        data = load_json(repo / rel)
        if isinstance(data, Exception):
            add("INVALID_JSON", posix, f"File is not valid JSON: {data}")
            continue
        if not isinstance(data, dict):
            continue

        record_id = data.get("recordId")
        if isinstance(record_id, str):
            if record_id in seen_record_ids and seen_record_ids[record_id] != posix:
                add(
                    "DUPLICATE_ID",
                    posix,
                    f"recordId '{record_id}' is also used by "
                    f"{seen_record_ids[record_id]}. Record IDs must be unique.",
                    key=record_id,
                )
            else:
                seen_record_ids[record_id] = posix

        record_type = data.get("recordType")
        if record_type:
            schema_name = f"{str(record_type).lower().replace('_', '-')}.schema.json"
            schema = schemas.get(schema_name)
            if schema:
                for error in validate(data, schema):
                    add(
                        "SCHEMA_INVALID",
                        posix,
                        f"{error} (schema/{schema_name})",
                        key=error[:80],
                    )
            else:
                note(f"{posix}: no schema/{schema_name}; not schema-validated.")

        if "links" in data:
            alignment_schema = schemas.get("alignment.schema.json")
            if alignment_schema:
                for error in validate(data, alignment_schema):
                    add(
                        "SCHEMA_INVALID",
                        posix,
                        f"{error} (schema/alignment.schema.json)",
                        key=error[:80],
                    )
            check_alignment(repo, rel, data)
        if record_type == "RELEASE_MANIFEST":
            check_release_manifest(repo, rel, data)
        check_approval(posix, data)


def check_alignment(repo: Path, rel: Path, data: dict) -> None:
    """
    Alignment integrity.

    Source token ids may legitimately keep a different verse numbering from the
    Spanish references (Zechariah's MT 2:1-4 is Protestant 1:18-21, Daniel has
    its own offsets). So a reference/token divergence is only a violation when
    it is *inconsistent*: within one file, a given reference must resolve to a
    single source verse. A systematic offset is fine; a stray token is not.
    """
    posix = rel.as_posix()
    links = data.get("links")
    if not isinstance(links, list):
        return

    if "numbering" not in data:
        add(
            "NUMBERING_UNDECLARED",
            posix,
            "Alignment record does not declare its verse-numbering basis, so source "
            "token ids cannot be interpreted against the references. Declare "
            "'numbering' (e.g. \"protestant\").",
            key="numbering",
        )

    seen_phrase_index: set = set()
    book_numbers: dict[str, int] = {}
    # reference -> {source verse -> occurrences}
    remap: dict[str, dict[tuple, int]] = {}
    token_locations: list[tuple] = []

    for link in links:
        if not isinstance(link, dict):
            continue
        phrase_index = link.get("phraseIndex")
        if phrase_index is not None:
            if phrase_index in seen_phrase_index:
                add(
                    "DUPLICATE_ID",
                    posix,
                    f"phraseIndex {phrase_index} appears more than once.",
                    key=f"phraseIndex:{phrase_index}",
                )
            seen_phrase_index.add(phrase_index)

        reference = str(link.get("reference", ""))
        ref_match = re.search(r"(\d+):(\d+)\s*$", reference)
        seen_unit_ids: set = set()

        for unit in link.get("units", []) or []:
            if not isinstance(unit, dict):
                continue
            unit_id = unit.get("unitId")
            if unit_id is not None:
                if unit_id in seen_unit_ids:
                    add(
                        "DUPLICATE_ID",
                        posix,
                        f"unitId '{unit_id}' appears more than once in "
                        f"phrase {phrase_index}.",
                        key=f"unitId:{phrase_index}:{unit_id}",
                    )
                seen_unit_ids.add(unit_id)

            for token_id in unit.get("sourceTokenIds", []) or []:
                parsed = TOKEN_ID.match(str(token_id))
                if not parsed:
                    add(
                        "MISSING_TOKEN_REF",
                        posix,
                        f"Source token id '{token_id}' is not a well-formed token "
                        "identifier.",
                        key=f"malformed:{token_id}",
                    )
                    continue
                book = int(parsed.group(2))
                source_verse = (int(parsed.group(3)), int(parsed.group(4)))
                book_numbers[str(token_id)] = book
                if ref_match:
                    key = f"{ref_match.group(1)}:{ref_match.group(2)}"
                    remap.setdefault(key, {})
                    remap[key][source_verse] = remap[key].get(source_verse, 0) + 1
                    token_locations.append((key, source_verse, str(token_id)))

    if book_numbers:
        counts: dict[int, int] = {}
        for book in book_numbers.values():
            counts[book] = counts.get(book, 0) + 1
        dominant_book = max(counts, key=lambda b: counts[b])
        for token_id, book in book_numbers.items():
            if book != dominant_book:
                add(
                    "MISSING_TOKEN_REF",
                    posix,
                    f"Token '{token_id}' belongs to book {book:02d}, but this file "
                    f"aligns book {dominant_book:02d}.",
                    key=f"foreignbook:{token_id}",
                )

    # A reference that resolves to more than one source verse is a real defect,
    # whatever the numbering scheme.
    for reference_key, verses in remap.items():
        if len(verses) <= 1:
            continue
        dominant = max(verses, key=lambda v: verses[v])
        for reference, source_verse, token_id in token_locations:
            if reference == reference_key and source_verse != dominant:
                add(
                    "MISSING_TOKEN_REF",
                    posix,
                    f"Reference {reference_key} resolves mostly to source verse "
                    f"{dominant[0]}:{dominant[1]}, but token '{token_id}' points at "
                    f"{source_verse[0]}:{source_verse[1]}.",
                    key=f"inconsistent:{reference_key}:{token_id}",
                )


def check_release_manifest(repo: Path, rel: Path, data: dict) -> None:
    posix = rel.as_posix()
    directory = (repo / rel).parent
    artifacts = data.get("artifacts") or {}
    revisions = data.get("inputRevisionIds") or {}

    for revision_kind, revision_id in revisions.items():
        if isinstance(revision_id, str) and not REVISION_ID.match(revision_id):
            add(
                "REVISION_MISMATCH",
                posix,
                f"inputRevisionIds.{revision_kind} = '{revision_id}' does not follow "
                "the PREFIX-book-<12 hex> revision-id convention.",
                key=f"format:{revision_kind}",
            )

    for kind, artifact in artifacts.items():
        if not isinstance(artifact, dict):
            continue
        filename = artifact.get("file")
        declared = artifact.get("sha256")
        if not filename or not declared:
            add(
                "REVISION_MISMATCH",
                posix,
                f"artifacts.{kind} must declare both 'file' and 'sha256'.",
                key=f"incomplete:{kind}",
            )
            continue
        target = directory / filename
        if not target.exists():
            add(
                "REVISION_MISMATCH",
                posix,
                f"artifacts.{kind} names '{filename}', which is not in the release "
                "directory.",
                key=f"absent:{kind}",
            )
            continue
        actual = sha256_of(target)
        if actual != declared:
            add(
                "REVISION_MISMATCH",
                posix,
                f"artifacts.{kind} checksum mismatch: manifest says {declared[:16]}…, "
                f"file hashes to {actual[:16]}….",
                key=f"checksum:{kind}",
            )

    text_artifact = artifacts.get("text") or {}
    text_name = text_artifact.get("file")
    declared_translation = revisions.get("translation")
    if text_name and declared_translation:
        text_path = directory / text_name
        if text_path.exists():
            head = text_path.read_text(encoding="utf-8", errors="replace")[:2000]
            header = HEADER_REVISION.search(head)
            if header and header.group(1) != declared_translation:
                add(
                    "REVISION_MISMATCH",
                    posix,
                    f"Published text declares translation-revision "
                    f"{header.group(1)} but the manifest binds "
                    f"{declared_translation}.",
                    key="header-vs-manifest",
                )
            elif not header:
                add(
                    "REVISION_MISMATCH",
                    posix,
                    f"'{text_name}' carries no translation-revision header, so the "
                    "published text is not bound to a translation revision.",
                    key="header-missing",
                )

    declared_files = {
        artifact.get("file")
        for artifact in artifacts.values()
        if isinstance(artifact, dict)
    }
    declared_files.add(rel.name)
    for entry in directory.iterdir():
        if entry.is_file() and entry.name != ".DS_Store" and entry.name not in declared_files:
            add(
                "UNDECLARED_RELEASE_FILE",
                (entry.relative_to(repo)).as_posix(),
                "File sits inside a release directory but is not declared by "
                "release-manifest.json.",
            )


APPROVED_VALUES = {"APPROVED", "approved"}


def check_approval(posix: str, data: dict) -> None:
    status = data.get("status")
    if status not in APPROVED_VALUES:
        return

    approver = data.get("approvedBy") or data.get("approver")
    approved_at = data.get("approvedAt")
    generator = data.get("generator")
    ai_used = data.get("aiUsed")
    created_by = str(data.get("createdBy", ""))

    if not approver or not approved_at:
        add(
            "STALE_APPROVAL",
            posix,
            "Record is approved but does not name both an approver and an "
            "approval timestamp.",
            key="unattributed",
        )

    bound = data.get("inputRevisionIds") or {}
    if not bound and not (
        data.get("translationRevision") and data.get("alignmentRevision")
    ):
        add(
            "STALE_APPROVAL",
            posix,
            "Record is approved but binds no exact translation/alignment revision.",
            key="unbound",
        )

    machine = ai_used is True or (
        isinstance(generator, dict) and generator.get("usesAI") is True
    )
    if machine or created_by.startswith("deterministic-") or "generator" in created_by:
        if not approver:
            add(
                "MACHINE_APPROVED",
                posix,
                f"Machine-produced record (createdBy='{created_by}') carries approved "
                "status with no human approver. Machine output stays draft until a "
                "human approves it.",
                key="auto-approved",
            )


# --------------------------------------------------------------------------
# baseline + reporting
# --------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description=f"{REPO_NAME} data-contract boundary check")
    parser.add_argument(
        "--repo",
        default=str(Path(__file__).resolve().parent.parent),
        help="Repository root (default: parent of scripts/).",
    )
    parser.add_argument(
        "--baseline",
        default=None,
        help=f"Baseline file of accepted pre-existing violations "
        f"(default: <repo>/{BASELINE_FILENAME}).",
    )
    parser.add_argument(
        "--emit-baseline",
        action="store_true",
        help="Print a baseline document for the current findings to stdout and exit 0. "
        "Writes nothing.",
    )
    parser.add_argument(
        "--schema-dir",
        default=None,
        help="Directory of *.schema.json (default: <repo>/schema). Useful for "
        "validating a checkout against schemas that are not merged yet.",
    )
    parser.add_argument("--json", action="store_true", help="Machine-readable output.")
    args = parser.parse_args()

    repo = Path(args.repo).resolve()
    if not repo.is_dir():
        print(f"error: {repo} is not a directory", file=sys.stderr)
        return 2

    check_boundaries(repo)
    check_translator_app(repo)
    check_records(repo, Path(args.schema_dir) if args.schema_dir else None)

    FINDINGS.sort(key=lambda f: (f["rule"], f["path"], f["key"]))

    if args.emit_baseline:
        print(
            json.dumps(
                {
                    "_comment": (
                        "Violations that already existed when the boundary check was "
                        "introduced. CI fails on anything not listed here. Shrink this "
                        "list; never grow it."
                    ),
                    "repository": REPO_NAME,
                    "accepted": [f["id"] for f in FINDINGS],
                },
                indent=2,
                ensure_ascii=False,
            )
        )
        return 0

    baseline_path = Path(args.baseline) if args.baseline else repo / BASELINE_FILENAME
    accepted: set[str] = set()
    if baseline_path.is_file():
        loaded = load_json(baseline_path)
        if isinstance(loaded, dict):
            accepted = set(loaded.get("accepted", []))
        else:
            print(f"error: cannot read baseline {baseline_path}: {loaded}", file=sys.stderr)
            return 2

    new = [f for f in FINDINGS if f["id"] not in accepted]
    current_ids = {f["id"] for f in FINDINGS}
    fixed = sorted(accepted - current_ids)

    if args.json:
        print(
            json.dumps(
                {
                    "repository": REPO_NAME,
                    "new": new,
                    "baselined": len(FINDINGS) - len(new),
                    "fixed": fixed,
                    "notes": NOTES,
                },
                indent=2,
                ensure_ascii=False,
            )
        )
        return 1 if new else 0

    print(f"{REPO_NAME} data-contract boundary check")
    print(f"  findings: {len(FINDINGS)}   baselined: {len(FINDINGS) - len(new)}   new: {len(new)}")
    if fixed:
        print(f"  fixed since baseline: {len(fixed)} (remove these from the baseline)")
        for entry in fixed:
            print(f"    - {entry}")
    if NOTES:
        print("\nnotes:")
        for entry in NOTES:
            print(f"  - {entry}")
    if new:
        print("\nNEW VIOLATIONS")
        for finding in new:
            print(f"  [{finding['rule']}] {finding['path']}")
            print(f"      {finding['message']}")
        print("\nThese are not in the baseline. Fix them, or justify and baseline them.")
        return 1
    print("\nOK - no new violations.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
