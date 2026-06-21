#!/usr/bin/env bash
# Symlink ~/Documentos/piano subfolders into repo samplers/ for local preview.
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
