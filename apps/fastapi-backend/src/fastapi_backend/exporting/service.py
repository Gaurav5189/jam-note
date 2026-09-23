"""Export services: markdown serialization, zip packing, JSON manifests.

Read-path only — exports are generated on the fly and never persisted
(make/import_export_DESIGN.md §2). Soft-deleted notes are already
excluded upstream: every fetch here goes through the notes service's
live-only queries.
"""

import json
import re
import zipfile
from collections import deque
from datetime import datetime, timezone
from tempfile import SpooledTemporaryFile
from typing import Any
from urllib.parse import quote

from bson import ObjectId

SCHEMA_VERSION = 1

# Zip entry slugs keep unicode letters (zip stores UTF-8 names); the
# Content-Disposition *header* uses the stricter ASCII slug below so
# the header itself can never carry non-ASCII bytes.
SLUG_MAX_CHARS = 100
ZIP_CHUNK_BYTES = 1 << 20
ZIP_SPOOL_MAX_BYTES = 64 << 20


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def slugify(name: str) -> str:
    """Filesystem-safe, unicode-friendly slug for zip entries."""
    slug = re.sub(r"[^\w\s-]", "", str(name), flags=re.UNICODE)
    slug = re.sub(r"[\s_-]+", "-", slug).strip("-_")
    return slug[:SLUG_MAX_CHARS] or "untitled"


def _ascii_slug(name: str) -> str:
    """ASCII-only slug for Content-Disposition `filename=` (the RFC
    fallback); `filename*` carries the full unicode slug."""
    slug = re.sub(r"[^A-Za-z0-9\s.-]", "", str(name))
    slug = re.sub(r"[\s_-]+", "-", slug).strip("-_")
    return slug[:SLUG_MAX_CHARS] or "untitled"


def content_disposition(filename: str) -> str:
    """RFC 6266 attachment header with an ASCII fallback + UTF-8 name.

    The unicode slug strips dots, so the extension is split off first
    and rejoined for BOTH names — otherwise `filename*` (which
    browsers prefer) would save "Notemd" instead of "Note.md"."""
    stem, dot, ext = str(filename).rpartition(".")
    if dot and ext and len(ext) <= 10:
        ascii_name = f"{_ascii_slug(stem)}.{ext}"
        utf8_name = quote(f"{slugify(stem)}.{ext}")
    else:
        ascii_name = _ascii_slug(filename)
        utf8_name = quote(slugify(filename))
    return f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{utf8_name}"


def _iso(value: Any) -> str:
    """ISO string with an explicit Z — pymongo returns naive UTC dates."""
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.isoformat() + "Z"
        return value.isoformat()
    return str(value)


# --- Markdown serialization ---------------------------------------------


def block_to_markdown(block: dict[str, Any]) -> str:
    """Render one stored block as standard markdown.

    Unknown/foreign block types fall back to their text property (or
    vanish) so an export never loses user content silently.
    """
    block_type = block.get("type", "text")
    properties = block.get("properties") or {}
    text = properties.get("text") or ""

    if block_type == "header-1":
        return f"# {text}".rstrip()
    if block_type == "header-2":
        return f"## {text}".rstrip()
    if block_type == "header-3":
        return f"### {text}".rstrip()
    if block_type == "todo":
        marker = "- [x]" if properties.get("checked") else "- [ ]"
        return f"{marker} {text}".rstrip()
    if block_type == "list-item":
        return f"- {text}".rstrip()
    if block_type == "code":
        language = properties.get("language") or ""
        return f"```{language}\n{text}\n```"
    if block_type == "image":
        src = properties.get("src")
        return f"![image]({src})" if src else "<!-- image block: no source -->"
    if block_type == "drawing":
        # Drawings are canvas-internal strokes (SVG paths / data URIs) —
        # they render as noise in raw markdown, so md exports skip them
        # entirely. The JSON manifest keeps them losslessly.
        return ""
    if block_type == "divider":
        return "---"
    # text + unknown types: emit their text payload as a plain line.
    return text


def note_to_markdown(
    note_doc: dict[str, Any], include_canvas_json: bool = False
) -> str:
    """Convert a note document to markdown.

    Canvas-layout notes export in plain block order (spatial
    coordinates dropped); `include_canvas_json` appends the raw
    canvas metadata as a fenced JSON block for lossless-ish re-import
    by hand.
    """
    parts: list[str] = [f"# {note_doc.get('title') or 'Untitled'}"]
    blocks = note_doc.get("blocks") or []

    rendered: list[str] = []
    prev_was_list = False
    for block in blocks:
        md = block_to_markdown(block)
        if md == "":
            continue
        is_list = md.startswith("- ")
        if rendered and is_list and prev_was_list:
            # Consecutive list/todo blocks stay adjacent — one list.
            rendered[-1] = f"{rendered[-1]}\n{md}"
        else:
            rendered.append(md)
        prev_was_list = is_list

    if rendered:
        parts.append("\n\n".join(rendered))

    if include_canvas_json:
        canvas = [
            {"block_id": block.get("id"), **(block.get("canvas_metadata") or {})}
            for block in blocks
            if block.get("canvas_metadata") is not None
        ]
        if canvas:
            parts.append("```json\n" + json.dumps(canvas, indent=2) + "\n```")

    return "\n\n".join(parts)


# --- Manifests ------------------------------------------------------------


def _docs_by_id(folder_docs: list[dict[str, Any]]) -> dict[Any, dict[str, Any]]:
    return {doc["_id"]: doc for doc in folder_docs}


def _absolute_name_chain(
    docs_by_id: dict[Any, dict[str, Any]], folder_id: Any
) -> list[str]:
    """Ancestor folder names from the workspace root down to `folder_id`
    (inclusive). A corrupted parent cycle stops at the first revisit."""
    chain: list[dict[str, Any]] = []
    seen: set[Any] = set()
    doc = docs_by_id.get(folder_id)
    while doc is not None and doc["_id"] not in seen:
        seen.add(doc["_id"])
        chain.append(doc)
        parent_id = doc.get("parent_folder_id")
        doc = docs_by_id.get(parent_id) if parent_id is not None else None
    chain.reverse()
    return [d["name"] for d in chain]


def _subtree_ids(
    docs_by_id: dict[Any, dict[str, Any]], root_folder_id: Any
) -> set[Any]:
    """The folder itself plus every descendant."""
    children: dict[Any, list[Any]] = {}
    for folder_id, doc in docs_by_id.items():
        children.setdefault(doc.get("parent_folder_id"), []).append(folder_id)
    subtree: set[Any] = set()
    queue: deque[Any] = deque([root_folder_id])
    while queue:
        current = queue.popleft()
        if current in subtree:
            continue
        subtree.add(current)
        queue.extend(children.get(current, []))
    return subtree


def _note_manifest_entry(
    note_doc: dict[str, Any], path: list[str]
) -> dict[str, Any]:
    return {
        "title": note_doc.get("title"),
        "path": path,
        "layout_type": note_doc.get("layout_type", "document"),
        "emoji_icon": note_doc.get("emoji_icon"),
        "color": note_doc.get("color"),
        "blocks": note_doc.get("blocks") or [],
        "block_connections": note_doc.get("block_connections") or [],
        "created_at": _iso(note_doc.get("created_at")),
        "updated_at": _iso(note_doc.get("updated_at")),
    }


def build_manifest(
    folder_docs: list[dict[str, Any]],
    note_docs: list[dict[str, Any]],
    root_folder_id: ObjectId | None = None,
) -> dict[str, Any]:
    """Build a backup manifest (import_export_DESIGN §2).

    Paths are the only portable folder linkage — every Mongo id is
    discarded. Two shapes:

    * **Workspace backup** (`root_folder_id=None`): the full tree with
      ABSOLUTE paths from the workspace root, so a workspace restore
      reproduces the nesting.
    * **Folder backup** (`root_folder_id` set): FLAT — every descendant
      note at the root, no folders in the manifest (user decision:
      exporting a file or folder must never re-create nesting on
      import; importing lands all files at the workspace root).
    """
    docs_by_id = _docs_by_id(folder_docs)

    if root_folder_id is not None:
        subtree = _subtree_ids(docs_by_id, root_folder_id)
        notes_in = [
            doc for doc in note_docs if doc.get("folder_id") in subtree
        ]
        return {
            "schema_version": SCHEMA_VERSION,
            "exported_at": _iso(utc_now()),
            "folders": [],
            "notes": [
                _note_manifest_entry(doc, [])
                for doc in sorted(notes_in, key=lambda d: d.get("created_at"))
            ],
        }

    folders: list[dict[str, Any]] = []
    for doc in sorted(folder_docs, key=lambda d: d.get("created_at")):
        chain = _absolute_name_chain(docs_by_id, doc["_id"])
        folders.append(
            {
                "name": doc["name"],
                # Absolute ancestors; own name lives in `name`.
                "path": chain[:-1],
                "color": doc.get("color"),
                "created_at": _iso(doc.get("created_at")),
                "updated_at": _iso(doc.get("updated_at")),
            }
        )

    notes: list[dict[str, Any]] = []
    for doc in sorted(note_docs, key=lambda d: d.get("created_at")):
        folder_id = doc.get("folder_id")
        chain = _absolute_name_chain(docs_by_id, folder_id) if folder_id else []
        notes.append(_note_manifest_entry(doc, chain))

    return {
        "schema_version": SCHEMA_VERSION,
        "exported_at": _iso(utc_now()),
        "folders": folders,
        "notes": notes,
    }


def build_note_manifest(
    folder_docs: list[dict[str, Any]], note_doc: dict[str, Any]
) -> dict[str, Any]:
    """Single-note manifest — the one envelope the importer accepts, so
    a note backup is directly restorable. Always flat: the note lands at
    the workspace root on import, regardless of where it lives now
    (user decision — no folder nesting on note/file exports)."""
    return {
        "schema_version": SCHEMA_VERSION,
        "exported_at": _iso(utc_now()),
        "folders": [],
        "notes": [_note_manifest_entry(note_doc, [])],
    }


# --- Zip ------------------------------------------------------------------


def build_zip(
    folder_docs: list[dict[str, Any]],
    note_docs: list[dict[str, Any]],
    root_folder_id: ObjectId | None = None,
) -> tuple[SpooledTemporaryFile, str]:
    """Pack notes as one markdown file per note.

    * **Workspace zip** (`root_folder_id=None`): the directory tree
      mirrors the sidebar (a full-workspace share).
    * **Folder zip** (`root_folder_id` set): FLAT — every descendant
      note as `Title.md` directly at the archive root (user decision:
      no folder nesting on folder exports). `unique_entry` dedupes
      colliding titles.

    Returns (spooled file, suggested filename)."""
    docs_by_id = _docs_by_id(folder_docs)
    root_chain = (
        _absolute_name_chain(docs_by_id, root_folder_id) if root_folder_id else []
    )

    flat = root_folder_id is not None
    if root_folder_id is None:
        notes_in = note_docs
        filename = "workspace-notes.zip"
    else:
        subtree = _subtree_ids(docs_by_id, root_folder_id)
        notes_in = [doc for doc in note_docs if doc.get("folder_id") in subtree]
        filename = f"{slugify(root_chain[-1] if root_chain else 'folder')}.zip"

    slug_chains: dict[Any, list[str]] = {
        doc["_id"]: [slugify(part) for part in _absolute_name_chain(docs_by_id, doc["_id"])]
        for doc in folder_docs
    }

    used_entries: set[str] = set()

    def unique_entry(entry: str) -> str:
        if entry not in used_entries:
            used_entries.add(entry)
            return entry
        stem, dot, ext = entry.rpartition(".")
        counter = 2
        while True:
            candidate = f"{stem}-{counter}.{ext}" if dot else f"{entry}-{counter}"
            if candidate not in used_entries:
                used_entries.add(candidate)
                return candidate
            counter += 1

    spool = SpooledTemporaryFile(max_size=ZIP_SPOOL_MAX_BYTES)
    with zipfile.ZipFile(spool, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as archive:
        for doc in sorted(notes_in, key=lambda d: d.get("created_at")):
            if flat:
                dir_parts: list[str] = []
            else:
                folder_id = doc.get("folder_id")
                dir_parts = slug_chains.get(folder_id, []) if folder_id else []
            entry = "/".join([*dir_parts, f"{slugify(doc.get('title') or 'Untitled')}.md"])
            archive.writestr(unique_entry(entry), note_to_markdown(doc))
    spool.seek(0)
    return spool, filename


def iter_zip_chunks(spool: SpooledTemporaryFile):
    """Yield the packed zip in chunks and close the spool afterwards."""
    try:
        while True:
            chunk = spool.read(ZIP_CHUNK_BYTES)
            if not chunk:
                break
            yield chunk
    finally:
        spool.close()
