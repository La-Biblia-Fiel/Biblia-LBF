"""Load gitignored .env files without overriding a real shell export."""

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CANDIDATES = (
    Path.home() / ".config" / "lbf" / "pipeline.env",
    ROOT / ".env",
    ROOT / "apps" / "pipeline" / ".env",
)


def load_local_env() -> None:
    for path in CANDIDATES:
        if not path.is_file():
            continue
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip("'").strip('"')
            if key and key not in os.environ:
                os.environ[key] = value


load_local_env()
