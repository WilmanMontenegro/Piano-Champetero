#!/usr/bin/env bash
# Dev only: symlinks (no copia). Producción: scripts/sync-piano-to-samplers.sh
# NUNCA escribe en ~/Documentos/piano — solo lectura.
set -euo pipefail

PIANO="${1:-$HOME/Documentos/piano}"
SAMPLERS="$(cd "$(dirname "$0")/.." && pwd)/samplers"

if [[ ! -d "$PIANO" ]]; then
  echo "No existe: $PIANO" >&2
  exit 1
fi

mkdir -p "$SAMPLERS"

for entry in "$PIANO"/*; do
  name="$(basename "$entry")"
  target="$SAMPLERS/$name"
  if [[ -e "$target" ]]; then
    echo "omitido (ya existe): $name"
    continue
  fi
  ln -s "$entry" "$target"
  echo "enlace: $name"
done

echo "Listo. Raíz flat de samplers/ no se toca (sonidos ya publicados)."
