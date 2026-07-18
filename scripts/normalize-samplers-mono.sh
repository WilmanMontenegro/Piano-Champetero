#!/usr/bin/env bash
# One-shot: peak-normalize (~-1 dBTP) + force mono for all samplers.
# Backup = git. Run from repo root: bash scripts/normalize-samplers-mono.sh
set -euo pipefail

ROOT="${1:-samplers}"
TARGET_PEAK_DB=-1.0
SKIP_GAIN_EPS=0.25
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

processed=0
skipped=0
failed=0

log() { printf '%s\n' "$*"; }

process_one() {
  local f=$1
  local ext channels max gain tmp codec_args
  ext=${f##*.}
  ext=${ext,,}

  channels=$(ffprobe -v error -select_streams a:0 -show_entries stream=channels -of csv=p=0 "$f" 2>/dev/null || echo "")
  max=$(ffmpeg -hide_banner -nostats -i "$f" -af volumedetect -f null - 2>&1 \
    | sed -n 's/.*max_volume: \([-0-9.]*\) dB.*/\1/p' | head -1)

  if [[ -z "$max" ]]; then
    log "FAIL (no peak): $f"
    return 1
  fi

  gain=$(python3 -c "print(round($TARGET_PEAK_DB - ($max), 4))")

  # Already mono and near target peak → skip rewrite
  if [[ "$channels" == "1" ]]; then
    python3 -c "import sys; sys.exit(0 if abs(float('$gain')) < $SKIP_GAIN_EPS else 1)" && {
      skipped=$((skipped + 1))
      return 0
    }
  fi

  tmp="$TMPDIR/out.$ext"
  case "$ext" in
    wav) codec_args=(-c:a pcm_s16le) ;;
    mp3) codec_args=(-c:a libmp3lame -q:a 2) ;;
    ogg) codec_args=(-c:a libvorbis -q:a 5) ;;
    m4a) codec_args=(-c:a aac -b:a 192k) ;;
    *) log "SKIP ext: $f"; skipped=$((skipped + 1)); return 0 ;;
  esac

  if ! ffmpeg -hide_banner -nostats -loglevel error -y -i "$f" \
      -ac 1 -af "volume=${gain}dB" "${codec_args[@]}" "$tmp"; then
    log "FAIL ffmpeg: $f"
    return 1
  fi

  mv -f "$tmp" "$f"
  processed=$((processed + 1))
  if (( processed % 50 == 0 )); then
    log "… $processed processed ($skipped skipped, $failed failed) — last: $f"
  fi
}

export -f process_one log
export TARGET_PEAK_DB SKIP_GAIN_EPS TMPDIR

while IFS= read -r -d '' f; do
  if ! process_one "$f"; then
    failed=$((failed + 1))
  fi
done < <(find "$ROOT" -type f \( -iname '*.wav' -o -iname '*.mp3' -o -iname '*.ogg' -o -iname '*.m4a' \) -print0 | sort -z)

log "Done. processed=$processed skipped=$skipped failed=$failed"
