#!/usr/bin/env bash
# Copy ~/Documentos/piano → repo samplers/ (read-only source). Never writes to piano/.
set -euo pipefail

PIANO="${1:-$HOME/Documentos/piano}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
SAMPLERS="$REPO/samplers"

if [[ ! -d "$PIANO" ]]; then
  echo "No existe (solo lectura): $PIANO" >&2
  exit 1
fi

mkdir -p "$SAMPLERS"

echo "Copiando $PIANO → $SAMPLERS (sin tocar piano/, sin sobrescribir Originales web/)..."
rsync -a --info=stats2 \
  --exclude='Originales web/' \
  "$PIANO/" "$SAMPLERS/"

echo "Convirtiendo .wma → .wav en samplers/ (solo proyecto)..."
find "$SAMPLERS" -iname '*.wma' -print0 | while IFS= read -r -d '' f; do
  wav="${f%.*}.wav"
  if [[ -f "$wav" ]]; then
    rm -f "$f"
  else
    ffmpeg -y -hide_banner -loglevel error -i "$f" "$wav" && rm -f "$f"
    echo "  convertido: $wav"
  fi
done

echo "Eliminando duplicados byte-idénticos en Originales web/..."
python3 "$REPO/scripts/dedupe-originales-web.py"

python3 "$REPO/scripts/build-sampler-catalog.py" --deploy
echo "Listo. Regenerado samplers-catalog.json"
