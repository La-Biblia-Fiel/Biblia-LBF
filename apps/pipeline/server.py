#!/usr/bin/env python3
"""Local UI: chapter GPT → Grok (Sonnet on warn); verse buttons four stations."""

from __future__ import annotations

import json
import sys
import traceback
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse

APP = Path(__file__).resolve().parent
PUBLIC = APP / "public"
TOOLS = APP.parents[1] / "tools" / "pipeline"
sys.path.insert(0, str(TOOLS))

import env_load  # noqa: E402, F401
from books import BOOKS  # noqa: E402
from runner import (  # noqa: E402
    chapter_job,
    ingest_audit,
    ingest_draft,
    load_queue,
    load_state,
    run_audit_draft,
    run_audit_polish,
    run_draft,
    run_polish,
    start_chapter,
)

PORT = int(__import__("os").environ.get("LBF_PIPELINE_PORT", "1432"))


def json_response(handler: SimpleHTTPRequestHandler, code: int, payload: dict) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def read_json(handler: SimpleHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length") or 0)
    if length > 2_000_000:
        raise ValueError("body too large")
    raw = handler.rfile.read(length) if length else b"{}"
    return json.loads(raw.decode("utf-8") or "{}")


def coords(payload: dict) -> tuple[str, int, int]:
    slug = str(payload.get("book") or "").strip()
    if slug not in BOOKS:
        raise KeyError(f"unknown book {slug!r}")
    return slug, int(payload["chapter"]), int(payload["verse"])


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC), **kwargs)

    def log_message(self, format: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), format % args))

    def end_headers(self) -> None:
        path = urlparse(self.path).path
        if path == "/" or path.endswith((".html", ".css", ".js")):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self) -> None:
        url = urlparse(self.path)
        if url.path == "/api/books":
            books = [
                {"slug": b.slug, "label": b.label, "testament": b.testament}
                for b in BOOKS.values()
            ]
            return json_response(self, 200, {"books": books})
        if url.path == "/api/verse":
            query = parse_qs(url.query)
            try:
                slug = query.get("book", [""])[0]
                chapter = int(query.get("chapter", ["0"])[0])
                verse = int(query.get("verse", ["0"])[0])
                state = load_state(slug, chapter, verse)
            except Exception as exc:
                return json_response(self, 400, {"error": str(exc)})
            return json_response(self, 200, state)
        if url.path == "/api/chapter":
            query = parse_qs(url.query)
            try:
                slug = query.get("book", [""])[0]
                chapter = int(query.get("chapter", ["0"])[0])
                if slug not in BOOKS:
                    raise KeyError(f"unknown book {slug!r}")
                queue = load_queue(slug, chapter)
                job = chapter_job()
                queue["job"] = job
                if job.get("running") and job.get("book") == slug and job.get("chapter") == chapter:
                    queue["running"] = True
                    queue["currentVerse"] = job.get("verse")
                    queue["currentStage"] = job.get("stage")
            except Exception as exc:
                return json_response(self, 400, {"error": str(exc)})
            return json_response(self, 200, queue)
        return super().do_GET()

    def do_POST(self) -> None:
        url = urlparse(self.path)
        actions = {
            "/api/draft": lambda p: run_draft(*coords(p)),
            "/api/audit-draft": lambda p: run_audit_draft(*coords(p)),
            "/api/polish": lambda p: run_polish(*coords(p)),
            "/api/audit-polish": lambda p: run_audit_polish(*coords(p)),
            "/api/ingest-draft": lambda p: ingest_draft(*coords(p), p.get("raw") or {}),
            "/api/ingest-audit": lambda p: ingest_audit(
                *coords(p), str(p.get("stage") or "draft"), p.get("raw") or {}
            ),
            "/api/chapter": lambda p: start_chapter(
                str(p.get("book") or "").strip(),
                int(p["chapter"]),
                start=int(p.get("start") or 1),
                end=int(p["end"]) if p.get("end") not in (None, "") else None,
                resume=p.get("resume", True),
                polish=str(p.get("polish") or "warn"),
            ),
        }
        fn = actions.get(url.path)
        if not fn:
            self.send_error(404)
            return
        try:
            payload = read_json(self)
            result = fn(payload)
            if url.path != "/api/chapter":
                slug, chapter, verse = coords(payload)
                result["state"] = load_state(slug, chapter, verse, build_if_missing=False)
            json_response(self, 200, result)
        except RuntimeError as exc:
            message = str(exc)
            code = 409 if (
                "no " in message.lower()
                or "must pass" in message.lower()
                or "already running" in message.lower()
            ) else 502
            json_response(self, code, {"error": message})
        except KeyError as exc:
            json_response(self, 400, {"error": str(exc)})
        except Exception as exc:
            traceback.print_exc()
            json_response(self, 500, {"error": str(exc)})


def main() -> int:
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"LBF pipeline  http://127.0.0.1:{PORT}/", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
