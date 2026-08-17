#!/usr/bin/env bash
# Levanta el sitio en local: regenera el contenido desde ../translation/
# y arranca el servidor de Hugo.
#
#   ./serve.sh            → http://localhost:1313
#   ./serve.sh 1400       → otro puerto
#
set -euo pipefail

cd "$(dirname "$0")"

PUERTO="${1:-1313}"

if ! command -v hugo >/dev/null 2>&1; then
  echo "✗ No se encontró 'hugo' en el PATH."
  echo "  Instálalo con:  brew install hugo"
  exit 1
fi

PY=""
for c in python3 python; do
  if command -v "$c" >/dev/null 2>&1; then PY="$c"; break; fi
done
if [ -z "$PY" ]; then
  echo "✗ No se encontró Python 3 en el PATH."
  exit 1
fi

echo "→ $(hugo version)"
echo "→ Generando el contenido desde ../translation/"
"$PY" tools/build-content.py

echo "→ Arrancando el servidor en http://localhost:${PUERTO}/"
echo "  (Ctrl+C para detenerlo)"
exec hugo server --port "$PUERTO" --bind 127.0.0.1 --disableFastRender --navigateToChanged
