#!/usr/bin/env python3
"""Remove Originales web/ files that are byte-identical to another file under samplers/."""

from __future__ import annotations

import hashlib
import sys
from collections import defaultdict
from pathlib import Path

ORIG_PREFIX = "Originales web/"
AUDIO = {".wav", ".mp3"}


def fingerprint(path: Path) -> tuple[int, str]:
    data = path.read_bytes()
    return len(data), hashlib.md5(data).hexdigest()


def main() -> int:
    samplers = Path(__file__).resolve().parent.parent / "samplers"
    if not samplers.is_dir():
        print("Missing samplers/", file=sys.stderr)
        return 1

    by_fp: dict[tuple[int, str], list[str]] = defaultdict(list)
    for path in samplers.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in AUDIO:
            continue
        rel = path.relative_to(samplers).as_posix()
        try:
            by_fp[fingerprint(path)].append(rel)
        except OSError:
            continue

    orig_dir = samplers / "Originales web"
    if not orig_dir.is_dir():
        print("No Originales web/ folder.")
        return 0

    removed = 0
    kept = 0
    for path in sorted(orig_dir.iterdir()):
        if not path.is_file():
            continue
        rel = path.relative_to(samplers).as_posix()
        try:
            fp = fingerprint(path)
        except OSError:
            kept += 1
            continue
        others = [r for r in by_fp.get(fp, []) if r != rel and not r.startswith(ORIG_PREFIX)]
        if others:
            path.unlink()
            removed += 1
            print(f"removed duplicate: {path.name} -> {others[0]}")
        else:
            kept += 1

    if orig_dir.is_dir() and not any(orig_dir.iterdir()):
        orig_dir.rmdir()
        print("Removed empty Originales web/")

    print(f"Originales web: kept {kept}, removed {removed} (size+MD5 match elsewhere)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
