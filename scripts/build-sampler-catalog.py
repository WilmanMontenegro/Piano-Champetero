#!/usr/bin/env python3
"""Build samplers-catalog.json.

  python3 scripts/build-sampler-catalog.py --deploy   # GitHub Pages (flat samplers/ only)
  python3 scripts/build-sampler-catalog.py [folder]   # full local gallery (default: ~/Documentos/piano)
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from datetime import datetime, timezone

AUDIO_SUFFIXES = {".wav", ".mp3"}
ROOT_NAME = "Samplers"
LEGACY_FOLDER_LABEL = "Sitio (raíz)"


def is_audio(path: Path) -> bool:
    return path.suffix.lower() in AUDIO_SUFFIXES


def scan_folder(folder: Path, base: Path) -> dict:
    children: list[dict] = []
    try:
        entries = sorted(folder.iterdir(), key=lambda p: (p.is_file(), p.name.lower()))
    except OSError:
        entries = []

    for entry in entries:
        if entry.name.startswith("."):
            continue
        if entry.is_dir():
            children.append(scan_folder(entry, base))
            continue
        if entry.is_file() and is_audio(entry):
            rel = entry.relative_to(base).as_posix()
            children.append({"name": entry.name, "type": "file", "path": rel})

    return {"name": folder.name, "type": "folder", "children": children}


def scan_legacy_root(samplers_dir: Path) -> dict | None:
    if not samplers_dir.is_dir():
        return None

    files: list[dict] = []
    for entry in sorted(samplers_dir.iterdir(), key=lambda p: p.name.lower()):
        if entry.is_symlink():
            continue
        if entry.is_file() and is_audio(entry):
            files.append({"name": entry.name, "type": "file", "path": entry.name})

    if not files:
        return None

    return {"name": LEGACY_FOLDER_LABEL, "type": "folder", "children": files}


def flatten_files(root: dict) -> list[dict]:
    files: list[dict] = []

    def walk(node: dict) -> None:
        if node.get("type") == "file":
            rel = node["path"]
            folder = rel.rsplit("/", 1)[0] if "/" in rel else ""
            files.append({"path": rel, "name": node["name"], "folder": folder})
            return
        for child in node.get("children", []):
            walk(child)

    for child in root.get("children", []):
        walk(child)
    return files


def simplify_folder(node: dict) -> dict:
    """Collapse folder→folder chains (no samplers in between) into one row."""
    if node.get("type") == "file":
        return node

    children = [simplify_folder(c) for c in node.get("children", [])]
    skip_merge = {ROOT_NAME, LEGACY_FOLDER_LABEL}

    while True:
        files = [c for c in children if c.get("type") == "file"]
        subfolders = [c for c in children if c.get("type") == "folder"]
        if files or len(subfolders) != 1:
            break
        inner = subfolders[0]
        if node.get("name") in skip_merge:
            display = inner["name"]
        else:
            display = f"{node['name']} › {inner['name']}"
        node = {"type": "folder", "name": display, "children": inner.get("children", [])}
        children = node["children"]

    return {
        **node,
        "children": [
            simplify_folder(c) if c.get("type") == "folder" else c for c in children
        ],
    }


def build_deploy_catalog(repo: Path) -> tuple[dict, list[dict]]:
    """Production: only real audio files in repo samplers/ (no symlinks, no subfolders)."""
    legacy = scan_legacy_root(repo / "samplers")
    if not legacy:
        legacy = {"name": LEGACY_FOLDER_LABEL, "type": "folder", "children": []}
    root = simplify_folder({"name": ROOT_NAME, "type": "folder", "children": [legacy]})
    return root, flatten_files(root)


def main() -> int:
    repo = Path(__file__).resolve().parent.parent
    out_file = repo / "samplers-catalog.json"

    if len(sys.argv) > 1 and sys.argv[1] == "--deploy":
        root, files = build_deploy_catalog(repo)
        payload = {
            "version": 1,
            "source": "deploy:samplers/",
            "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "root": root,
            "files": files,
        }
        out_file.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"Wrote {out_file} ({len(files)} deployable files)")
        return 0

    source = Path(
        sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/Documentos/piano")
    ).expanduser()

    if not source.is_dir():
        print(f"Missing source folder: {source}", file=sys.stderr)
        return 1

    root_children: list[dict] = []
    for entry in sorted(source.iterdir(), key=lambda p: p.name.lower()):
        if entry.name.startswith("."):
            continue
        if entry.is_dir():
            root_children.append(scan_folder(entry, source))
        elif entry.is_file() and is_audio(entry):
            rel = entry.relative_to(source).as_posix()
            root_children.append({"name": entry.name, "type": "file", "path": rel})

    legacy = scan_legacy_root(repo / "samplers")
    if legacy:
        root_children.insert(0, legacy)

    root = simplify_folder({"name": ROOT_NAME, "type": "folder", "children": root_children})
    files = flatten_files(root)

    payload = {
        "version": 1,
        "source": str(source),
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "root": root,
        "files": files,
    }

    out_file.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {out_file} ({len(files)} files)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
