#!/usr/bin/env python3
"""
Finish a release after a human has approved it.

The gate was never the problem. Approval was recorded in a file beside the
manifest that nothing downstream read, so every book stopped the moment a human
said yes: Zechariah approved at 12:59:13 with its manifest still reading
PENDING, Daniel released from a draft its canonical text has since overtaken.

This script is the missing step. It re-verifies the approval mechanically, and
either COMPLETES the release or says exactly what is stale and what to do next.

It never mutates release-manifest.json. The approval binds that file's sha256,
so rewriting it would break the very binding it records. Completion is written
alongside as release-state.json.

Exit codes:
  0  release completed, or already complete
  1  blocked - something is stale or missing (details printed)
  2  usage error
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_VERIFICATION = ROOT / "apps" / "translator" / "verification"
# Spanish canonical filename per OSIS-ish release book name.
BOOK_ALIASES = {"zechariah": "zacarias", "daniel": "daniel"}

blockers: list[dict] = []
notes: list[str] = []


def block(rule: str, detail: str, action: str) -> None:
    blockers.append({"rule": rule, "detail": detail, "nextAction": action})


def sha256_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def load(p: Path):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        return exc


def verse_map_structured(p: Path) -> dict:
    v, cur, buf = {}, None, []
    for line in p.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^###\s+(\d+):(\d+)\s*$", line.strip())
        if m:
            if cur:
                v[cur] = " ".join(buf).strip()
            cur, buf = (int(m.group(1)), int(m.group(2))), []
            continue
        if cur is None:
            continue
        s = line.strip()
        if not s or s.startswith("#") or s.startswith(">"):
            continue
        buf.append(s)
    if cur:
        v[cur] = " ".join(buf).strip()
    return v


def verse_map_flat(p: Path) -> dict:
    v = {}
    for line in p.read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\S+\s+(\d+):(\d+)\s+(.+)$", line.strip())
        if m:
            v[(int(m.group(1)), int(m.group(2)))] = m.group(3).strip()
    return v


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def find_build(book: str) -> Path | None:
    base = ROOT / "releases" / book
    if not base.is_dir():
        return None
    builds = sorted(p for v in base.iterdir() if v.is_dir() for p in v.iterdir() if p.is_dir())
    return builds[-1] if builds else None


def canonical_translation(book: str) -> Path | None:
    slug = BOOK_ALIASES.get(book, book)
    for sub in ("ot", "nt"):
        p = ROOT / "translation" / sub / f"{slug}.md"
        if p.is_file():
            return p
    return None


def working_alignment(book: str) -> Path | None:
    slug = BOOK_ALIASES.get(book, book)
    for sub in ("ot", "nt"):
        p = ROOT / "alignment" / sub / slug / f"{slug}-reverse-links.json"
        if p.is_file():
            return p
    return None


def check(book: str, verification_dir: Path, apply: bool) -> int:
    build = find_build(book)
    if not build:
        print(f"error: no release build under releases/{book}/", file=sys.stderr)
        return 2
    manifest_path = build / "release-manifest.json"
    manifest = load(manifest_path)
    if isinstance(manifest, Exception):
        print(f"error: unreadable manifest: {manifest}", file=sys.stderr)
        return 2

    print(f"book       {book}")
    print(f"build      {build.name}")
    print(f"manifest   status={manifest.get('status')}  approvedBy={manifest.get('approvedBy')}")

    vdir = verification_dir / book
    if not vdir.is_dir():
        block("NO_VERIFICATION_RECORDS", f"no records under {vdir}",
              "Run the review workflow for this book.")
        return report(book, build, manifest, None, apply)

    review = load(vdir / "book-review.json") if (vdir / "book-review.json").is_file() else None
    approval = load(vdir / "release-approval.json") if (vdir / "release-approval.json").is_file() else None

    # ---- human review ----
    if not isinstance(review, dict):
        block("NO_BOOK_REVIEW", "book-review.json missing", "Complete the book review gate.")
    else:
        if review.get("result") != "PASS":
            block("REVIEW_NOT_PASS", f"book review result={review.get('result')}",
                  "Resolve review findings and re-review.")
        if review.get("authority") != "HUMAN" or review.get("aiUsed") is True:
            block("REVIEW_NOT_HUMAN",
                  f"authority={review.get('authority')} aiUsed={review.get('aiUsed')}",
                  "A human must perform the review.")

    # ---- release approval binds these exact manifest bytes ----
    if not isinstance(approval, dict):
        block("NO_RELEASE_APPROVAL", "release-approval.json missing",
              "The assigned human approver must approve this manifest.")
    else:
        actual = sha256_file(manifest_path)
        if approval.get("manifestSha256") != actual:
            block("APPROVAL_BINDS_OTHER_BYTES",
                  f"approval binds {str(approval.get('manifestSha256'))[:16]}…, "
                  f"manifest hashes to {actual[:16]}…",
                  "Re-approve the current manifest, or restore the approved build.")
        if approval.get("authority") != "HUMAN" or approval.get("aiUsed") is True:
            block("APPROVAL_NOT_HUMAN", f"authority={approval.get('authority')}",
                  "A human must approve the release.")

    # ---- artifacts match their checksums ----
    for kind, art in (manifest.get("artifacts") or {}).items():
        f = build / art["file"]
        if not f.is_file():
            block("ARTIFACT_MISSING", f"{kind}: {art['file']} absent", "Rebuild the release.")
        elif sha256_file(f) != art["sha256"]:
            block("ARTIFACT_CHECKSUM", f"{kind}: {art['file']} does not match its checksum",
                  "Rebuild the release.")

    # ---- is the approved content still the current content? ----
    canon = canonical_translation(book)
    text_art = (manifest.get("artifacts") or {}).get("text", {}).get("file")
    if canon and text_art and (build / text_art).is_file():
        c, r = verse_map_structured(canon), verse_map_flat(build / text_art)
        diff = [k for k in sorted(set(c) & set(r)) if norm(c[k]) != norm(r[k])]
        if diff:
            block("TEXT_SUPERSEDED",
                  f"canonical {canon.relative_to(ROOT)} differs from the released text "
                  f"in {len(diff)} of {len(set(c) & set(r))} verses",
                  f"Cut a new version from current canonical text (first: "
                  f"{diff[0][0]}:{diff[0][1]}).")
        else:
            notes.append(f"text current: canonical matches the release in all {len(r)} verses")

    wa = working_alignment(book)
    align_art = (manifest.get("artifacts") or {}).get("alignment", {}).get("file")
    if wa and align_art and (build / align_art).is_file():
        w, r = load(wa), load(build / align_art)
        if isinstance(w, dict) and isinstance(r, dict):
            wu = sum(len(l.get("units") or []) for l in w.get("links", []))
            ru = sum(len(l.get("units") or []) for l in r.get("links", []))
            wstat = {l.get("status") for l in w.get("links", [])}
            rstat = {l.get("status") for l in r.get("links", [])}
            if wu != ru or wstat != rstat:
                block("ALIGNMENT_SUPERSEDED",
                      f"working alignment has {wu} units {sorted(wstat)}; the release "
                      f"shipped {ru} units {sorted(rstat)}",
                      "Cut a new version with the current alignment and re-run the "
                      "alignment gate (G0B) against it.")
            else:
                notes.append(f"alignment current: {wu} units, {sorted(wstat)}")

    return report(book, build, manifest, approval, apply)


def report(book, build, manifest, approval, apply: bool) -> int:
    print()
    for n in notes:
        print(f"  ok      {n}")
    if not blockers:
        state = {
            "recordType": "RELEASE_STATE",
            "book": book,
            "buildId": manifest.get("buildId"),
            "version": manifest.get("version"),
            "status": "COMPLETE",
            "manifestId": manifest.get("recordId"),
            "manifestSha256": sha256_file(build / "release-manifest.json"),
            "approvalRecordId": (approval or {}).get("recordId"),
            "approver": (approval or {}).get("approver"),
            "approvedAt": (approval or {}).get("timestamp") or (approval or {}).get("approvedAt"),
            "completedBy": "scripts/complete-release.py",
            "note": (
                "The manifest is immutable and still reads its build-time status; "
                "the approval binds its bytes. This file is the release's completed "
                "state."
            ),
        }
        out = build / "release-state.json"
        print(f"\n  RELEASE COMPLETE — {book} {manifest.get('version')}")
        if apply:
            out.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(f"  wrote {out.relative_to(ROOT)}")
        else:
            print(f"  would write {out.relative_to(ROOT)}  (re-run with --apply)")
        return 0

    print(f"\n  BLOCKED — {len(blockers)} item(s)\n")
    for b in blockers:
        print(f"  [{b['rule']}]")
        print(f"      {b['detail']}")
        print(f"      next: {b['nextAction']}")
    return 1


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--book", required=True)
    ap.add_argument("--verification-dir", default=str(DEFAULT_VERIFICATION))
    ap.add_argument("--apply", action="store_true", help="Write release-state.json when complete.")
    a = ap.parse_args()
    return check(a.book, Path(a.verification_dir), a.apply)


if __name__ == "__main__":
    sys.exit(main())
