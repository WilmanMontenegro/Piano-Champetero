#!/usr/bin/env python3
"""Remove root samplers/ duplicates that already exist in subfolders."""

from __future__ import annotations

import hashlib
import json
import shutil
import sys
from pathlib import Path

AUDIO = {".wav", ".mp3", ".wma"}
LEGACY_DIR = "Originales web"


def digest(path: Path) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        h.update(f.read())
    return h.hexdigest()


def pick_canonical(root_name: str, paths: list[str]) -> str:
    lower = root_name.lower()
    exact = [p for p in paths if Path(p).name.lower() == lower]
    pool = exact if exact else paths
    return sorted(pool, key=lambda p: (p.count("/"), p.lower()))[0]


def main() -> int:
    repo = Path(__file__).resolve().parent.parent
    root = repo / "samplers"
    if not root.is_dir():
        print("Missing samplers/", file=sys.stderr)
        return 1

    by_hash: dict[str, list[str]] = {}
    by_name: dict[str, list[str]] = {}
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in AUDIO:
            continue
        if path.parent == root:
            continue
        rel = path.relative_to(root).as_posix()
        by_hash.setdefault(digest(path), []).append(rel)
        by_name.setdefault(path.name.lower(), []).append(rel)

    deleted: list[str] = []
    mapped: dict[str, str] = {}
    kept_root: list[Path] = []

    for path in sorted(root.iterdir(), key=lambda p: p.name.lower()):
        if not path.is_file() or path.suffix.lower() not in AUDIO:
            continue
        name = path.name
        try:
            file_digest = digest(path)
        except OSError as err:
            print(f"skip unreadable: {name} ({err})", file=sys.stderr)
            kept_root.append(path)
            continue

        if file_digest in by_hash:
            canonical = pick_canonical(name, by_hash[file_digest])
            mapped[name] = canonical
            path.unlink()
            deleted.append(name)
            print(f"delete duplicate: {name} -> {canonical}")
            continue

        kept_root.append(path)

    legacy = root / LEGACY_DIR
    legacy.mkdir(exist_ok=True)
    moved: list[str] = []
    for path in kept_root:
        dest = legacy / path.name
        if dest.exists():
            print(f"skip move (exists): {path.name}", file=sys.stderr)
            continue
        shutil.move(str(path), str(dest))
        rel = f"{LEGACY_DIR}/{path.name}"
        moved.append(rel)
        mapped[path.name] = rel
        print(f"move to legacy: {path.name} -> {rel}")

    report = {
        "deleted_duplicates": deleted,
        "moved_to_legacy": moved,
        "path_map": mapped,
    }
    report_path = repo / "scripts" / ".dedupe-samplers-report.json"
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nDeleted {len(deleted)} duplicates, moved {len(moved)} to {LEGACY_DIR}/")
    print(f"Report: {report_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
