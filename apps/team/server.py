#!/usr/bin/env python3
"""Team desk for La Biblia Fiel.

One computer holds the API key. Everyone else opens this page and claims a book.
GPT-5.6 Sol drafts the empty verses. Existing Spanish is left as it is.

    python3 apps/team/server.py

Then open http://127.0.0.1:1435/ . Share http://<this-machine>:1435/ on a trusted network.
Set LBF_TEAM_TOKEN if that network is not private.
"""

from __future__ import annotations

import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parent))

import desk  # noqa: E402

PUBLIC = Path(__file__).resolve().parent / "public"
HOST = os.environ.get("LBF_TEAM_HOST", "0.0.0.0")
PORT = int(os.environ.get("LBF_TEAM_PORT", "1435"))


def check_token(payload: dict) -> None:
    desk.authorize(str(payload.get("name") or ""), str(payload.get("token") or ""))


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        return

    def _send(self, code: int, payload: dict | None = None, body: bytes | None = None, content_type: str = "application/json") -> None:
        data = body if body is not None else json.dumps(payload or {}, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _read(self) -> dict:
        length = int(self.headers.get("Content-Length") or "0")
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise ValueError("The request was not JSON.") from exc
        if not isinstance(payload, dict):
            raise ValueError("The request was not a JSON object.")
        return payload

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/api/board":
            self._send(200, desk.board())
            return
        if path in {"/", "/index.html"}:
            page = (PUBLIC / "index.html").read_bytes()
            self._send(200, body=page, content_type="text/html; charset=utf-8")
            return
        self._send(404, {"error": "Not found"})

    def do_POST(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        actions = {
            "/api/claim": desk.claim,
            "/api/release": desk.release,
            "/api/start": desk.start,
            "/api/stop": desk.stop,
        }
        action = actions.get(path)
        if action is None:
            self._send(404, {"error": "Not found"})
            return
        try:
            payload = self._read()
            check_token(payload)
            action(
                str(payload.get("name") or ""),
                str(payload.get("book") or ""),
                str(payload.get("token") or ""),
            )
        except ValueError as exc:
            self._send(400, {"error": str(exc)})
            return
        except Exception as exc:  # noqa: BLE001
            self._send(500, {"error": str(exc)})
            return
        self._send(200, desk.board())


def main() -> None:
    threading.Thread(target=desk.warm_totals, name="lbf-team-totals", daemon=True).start()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(
        f"LBF team desk  http://127.0.0.1:{PORT}/  model={desk.model_name()}  people={len(desk.load_people())}",
        flush=True,
    )
    server.serve_forever()


if __name__ == "__main__":
    main()
