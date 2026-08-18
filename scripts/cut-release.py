#!/usr/bin/env python3
"""
Cut a release build from current canonical data. Deterministic.

Reads only canonical project data:
  translation/{ot,nt}/<slug>.md          text
  alignment/{ot,nt}/<slug>/<slug>-reverse-links.json   alignment

Writes a fresh immutable build directory. It does NOT approve anything: status
is PENDING and approvedBy is null, because approval is a human act. Run
scripts/complete-release.py afterwards to see what is still required.

Revision ids follow the existing convention, PREFIX-book-<first 12 hex of the
artifact sha256>, so an id always identifies the exact bytes it names.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SLUG = {"zechariah": "zacarias", "daniel": "daniel"}
ENGLISH = {"zechariah": "Zechariah", "daniel": "Daniel"}


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def canonical_text(book: str) -> Path:
    slug = SLUG.get(book, book)
    for sub in ("ot", "nt"):
        p = ROOT / "translation" / sub / f"{slug}.md"
        if p.is_file():
            return p
    raise SystemExit(f"no canonical translation for {book}")


def canonical_alignment(book: str) -> Path:
    slug = SLUG.get(book, book)
    for sub in ("ot", "nt"):
        p = ROOT / "alignment" / sub / slug / f"{slug}-reverse-links.json"
        if p.is_file():
            return p
    raise SystemExit(f"no canonical alignment for {book}")


def export_text(book: str, src: Path) -> str:
    """Structured markdown -> one `Book c:v text` line per verse, release form."""
    verses, cur, buf = [], None, []
    for line in src.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^###\s+(\d+):(\d+)\s*$", line.strip())
        if m:
            if cur:
                verses.append((cur, " ".join(buf).strip()))
            cur, buf = (int(m.group(1)), int(m.group(2))), []
            continue
        if cur is None:
            continue
        s = line.strip()
        if not s or s.startswith("#") or s.startswith(">"):
            continue
        buf.append(s)
    if cur:
        verses.append((cur, " ".join(buf).strip()))
    verses.sort(key=lambda x: x[0])
    name = ENGLISH.get(book, book.title())
    body = "".join(f"{name} {c}:{v} {t}\n" for (c, v), t in verses)
    return body, len(verses)


def wrap_with_header(book: str, version: str, tr_id: str, body: str) -> str:
    """
    Release form: an HTML comment header, then one verse per line.

    The header carries the translation revision, which is why the artifact's own
    sha256 can never equal that revision id — the id is inside the bytes being
    hashed. Text identity is therefore compared on the BODY, not the file.
    """
    return (
        "<!-- LBF \u2014 La Biblia Fiel\n"
        f"     book: {book}\n"
        "     edition: LBF\n"
        f"     version: {version}\n"
        f"     translation-revision: {tr_id}\n"
        "-->\n"
    ) + body


def released_body(path: Path) -> str:
    t = path.read_text(encoding="utf-8")
    return t.split("-->\n", 1)[1] if "-->" in t else t


def export_alignment(book: str, src: Path, prev: dict | None) -> str:
    d = json.loads(src.read_text(encoding="utf-8"))
    links = d["links"]
    statuses = sorted({l.get("status") for l in links})
    human = statuses == ["seeded-hand"]
    out = {
        "bookId": d["bookId"],
        "textualBasis": d["textualBasis"],
        "schemaVersion": d.get("schemaVersion"),
        # 1.0.0 omitted this, so a consumer could not tell whether the source
        # token ids were MT or Protestant. Declared from here on.
        "numbering": d.get("numbering"),
        "generator": {
            "name": "hand-alignment",
            "usesAI": False,
            "verificationAuthority": False,
            "status": "HUMAN_SEEDED" if human else "MIXED",
        },
        "links": links,
    }
    return json.dumps(out, ensure_ascii=False, indent=2) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--book", required=True)
    ap.add_argument("--version", required=True)
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    book, version = a.book, a.version

    prev_dir = None
    base = ROOT / "releases" / book
    if base.is_dir():
        cands = sorted(p for v in base.iterdir() if v.is_dir() for p in v.iterdir() if p.is_dir())
        prev_dir = cands[-1] if cands else None
    prev = json.loads((prev_dir / "release-manifest.json").read_text()) if prev_dir else None

    body, verse_count = export_text(book, canonical_text(book))
    align_body = export_alignment(book, canonical_alignment(book), prev)
    align_sha = sha(align_body.encode())
    body_sha = sha(body.encode())

    # Compare BODY hashes, not file hashes: the header embeds the revision id, so
    # two releases of identical text always differ as files.
    prev_body_sha = None
    if prev_dir:
        prev_text = prev_dir / prev["artifacts"]["text"]["file"]
        if prev_text.is_file():
            prev_body_sha = sha(released_body(prev_text).encode())
    if prev and prev_body_sha == body_sha:
        tr_id = prev["inputRevisionIds"]["translation"]
        text_note = "unchanged from the previous release (identical body)"
    else:
        tr_id = f"TR-{book}-{body_sha[:12]}"
        text_note = "new text revision"
    text_body = wrap_with_header(book, version, tr_id, body)
    text_sha = sha(text_body.encode())
    src_id = (prev or {}).get("inputRevisionIds", {}).get("source", f"SRC-{book}-{'0'*12}")
    aln_id = f"ALN-{book}-{align_sha[:12]}"
    build_id = f"LBF-{book}-{version}-{sha((text_sha + align_sha).encode())[:12]}"
    record_id = f"RELMAN-{book}-{sha((build_id + tr_id + aln_id).encode())[:12]}"

    manifest = {
        "recordId": record_id,
        "schemaVersion": 1,
        "revision": 1,
        "recordType": "RELEASE_MANIFEST",
        "book": book,
        "edition": "LBF",
        "version": version,
        "buildId": build_id,
        "status": "PENDING",
        "createdBy": "scripts/cut-release.py",
        "aiUsed": False,
        "createdAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "inputRevisionIds": {"source": src_id, "translation": tr_id, "alignment": aln_id},
        "bookReviewId": None,
        "artifacts": {
            "text": {"file": f"{book}.lbf.md", "sha256": text_sha},
            "alignment": {"file": f"{book}.alignment.json", "sha256": align_sha},
        },
        "supersedes": (prev or {}).get("buildId"),
        "changeFromPrevious": {
            "text": text_note,
            "alignment": "rebuilt from the hand alignment",
        },
    }

    out = ROOT / "releases" / book / version / build_id
    print(f"book        {book} {version}")
    print(f"buildId     {build_id}")
    print(f"supersedes  {manifest['supersedes']}")
    print(f"text        {verse_count} verses  sha {text_sha[:16]}  ({text_note})")
    print(f"alignment   sha {align_sha[:16]}")
    print(f"revisions   {manifest['inputRevisionIds']}")
    if not a.apply:
        print(f"\nwould write {out.relative_to(ROOT)}  (re-run with --apply)")
        return 0
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{book}.lbf.md").write_text(text_body, encoding="utf-8")
    (out / f"{book}.alignment.json").write_text(align_body, encoding="utf-8")
    (out / "release-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\nwrote {out.relative_to(ROOT)}")
    print("status PENDING — a human must review the alignment gate and approve.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
