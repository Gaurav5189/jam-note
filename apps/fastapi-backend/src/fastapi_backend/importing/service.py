"""Import service — the validation gauntlet (import_export_DESIGN §3).

Import exists for restore, not conversion. Only jam-note's own JSON
manifest is accepted; markdown is pasted into notes, never imported.
After the full gauntlet a hostile file can only create ugly notes in
the attacker's own workspace.

The commit runs inside one Mongo transaction (Atlas / replica sets).
Where sessions are unavailable (unit tests, standalone dev servers)
it falls back to sequential inserts with compensating deletes —
either way a partial import is impossible from the caller's view.
"""

import json
import time
from collections import deque
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from bson import ObjectId
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import ValidationError
from pymongo.errors import DuplicateKeyError

from fastapi_backend.importing import models


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


IMPORT_RATE_LIMIT = 5
IMPORT_RATE_WINDOW_SECONDS = 3600.0

# Per-process rate tracker (single-server deployment; noted in
# ARCHITECTURE.md). Keyed by user id.
_recent_imports: dict[str, deque[float]] = {}


def check_rate_limit(user_id: str) -> None:
    """Imports are expensive (full validation + bulk inserts); note
    saves are not. ~5 imports per user per hour."""
    window = _recent_imports.setdefault(user_id, deque())
    now = time.monotonic()
    while window and now - window[0] > IMPORT_RATE_WINDOW_SECONDS:
        window.popleft()
    if len(window) >= IMPORT_RATE_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Import limit reached — 5 per hour, try again later",
        )
    window.append(now)


def _reject_constant(value: str) -> None:
    # json accepts NaN/Infinity by default; a backup carrying them is
    # not a jam-note export and must die here.
    raise ValueError(f"'{value}' is not valid in a jam-note backup")


def _json_depth(value: Any, depth: int = 1) -> int:
    """Deepest nesting level of a parsed JSON value (RecursionError DoS
    guard — checked BEFORE Pydantic ever walks the structure)."""
    if depth > models.MAX_JSON_DEPTH:
        return depth
    if isinstance(value, dict):
        return max(
            (_json_depth(item, depth + 1) for item in value.values()),
            default=depth,
        )
    if isinstance(value, list):
        return max(
            (_json_depth(item, depth + 1) for item in value),
            default=depth,
        )
    return depth


def _first_error_message(exc: ValidationError) -> str:
    error = exc.errors()[0]
    location = ".".join(str(part) for part in error.get("loc", [])) or "manifest"
    return f"{location}: {error.get('msg', 'invalid value')}"


def parse_manifest_body(body: bytes) -> models.ImportManifest:
    """Bytes → validated manifest. Every rejection carries a specific
    message the Profile import row renders as a red toast."""
    if len(body) > models.MAX_JSON_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Too large — 10 MB max",
        )
    try:
        parsed = json.loads(body, parse_constant=_reject_constant)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid JSON — {exc}",
        )
    except RecursionError:
        # Python's json scanner recurses on nesting — a hostile payload
        # deeper than the interpreter stack must die here, not as a 500.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Too deeply nested — max {models.MAX_JSON_DEPTH} levels",
        )
    if not isinstance(parsed, dict):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid backup — expected a jam-note manifest object",
        )
    if _json_depth(parsed) > models.MAX_JSON_DEPTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Too deeply nested — max {models.MAX_JSON_DEPTH} levels",
        )
    try:
        return models.ImportManifest.model_validate(parsed)
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=_first_error_message(exc),
        )


def validate_content(manifest: models.ImportManifest) -> None:
    """The content layer of the gauntlet: src scheme allowlist."""
    for note_index, note in enumerate(manifest.notes):
        for block_index, block in enumerate(note.blocks):
            src = block.properties.src
            if src is None:
                continue
            where = f"notes[{note_index}].blocks[{block_index}]"
            if src.startswith("https://"):
                if len(src) > models.MAX_HTTP_SRC_CHARS:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"{where}: image URL too long",
                    )
                continue
            if src.startswith("data:image/png;base64,"):
                if len(src) > models.MAX_DATA_SRC_CHARS:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"{where}: drawing payload too large",
                    )
                continue
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"{where}: unsupported src — https:// URLs or PNG data URLs "
                    "only (javascript: and other schemes are rejected)"
                ),
            )


def preview_manifest(
    manifest: models.ImportManifest, size_bytes: int
) -> models.ImportPreviewOut:
    folders = len(manifest.folders)
    notes = len(manifest.notes)
    message = f"{notes} note{'s' if notes != 1 else ''}, {folders} folder{'s' if folders != 1 else ''}"
    return models.ImportPreviewOut(
        folders=folders,
        notes=notes,
        size_bytes=size_bytes,
        message=message,
    )


def _prepare_note_payload(note: models.ImportNote) -> tuple[list[dict], list[dict]]:
    """Blocks + connections with server-side id normalization.

    Valid unique ids pass through (lossless roundtrip); anything else
    regenerates every id in the note BY INDEX (duplicated raw ids must
    not share a regenerated id) and remaps connections. Dangling, self,
    or duplicate connections are dropped.
    """
    raw_ids = [block.id for block in note.blocks]
    ids_valid = (
        all(raw_id is not None for raw_id in raw_ids)
        and len(set(raw_ids)) == len(raw_ids)
    )

    if ids_valid:
        block_ids = list(raw_ids)
        id_map = {raw_id: raw_id for raw_id in raw_ids}
    else:
        block_ids = [uuid4().hex for _ in raw_ids]
        # First occurrence of each raw id wins the mapping; duplicates
        # intentionally receive their own fresh id.
        id_map: dict[str, str] = {}
        for raw_id, new_id in zip(raw_ids, block_ids):
            if raw_id is not None and raw_id not in id_map:
                id_map[raw_id] = new_id

    blocks: list[dict] = []
    for block, new_id in zip(note.blocks, block_ids):
        blocks.append(
            {
                "id": new_id,
                "type": block.type,
                "properties": block.properties.model_dump(),
                "canvas_metadata": (
                    block.canvas_metadata.model_dump()
                    if block.canvas_metadata is not None
                    else None
                ),
            }
        )

    seen: set[tuple[str, str]] = set()
    connections: list[dict] = []
    for connection in note.block_connections:
        from_id = id_map.get(connection.from_id)
        to_id = id_map.get(connection.to_id)
        if not from_id or not to_id or from_id == to_id:
            continue
        if (from_id, to_id) in seen:
            continue
        seen.add((from_id, to_id))
        connections.append(
            {"from_id": from_id, "to_id": to_id, "color": connection.color}
        )
    return blocks, connections


class _Inserted:
    """Accumulator so the fallback path can compensate mid-failures."""

    def __init__(self) -> None:
        self.folder_ids: list[ObjectId] = []
        self.note_ids: list[ObjectId] = []


def _session_kwargs(session: Any) -> dict[str, Any]:
    # Session=None must be OMITTED, not passed — mongomock collections
    # don't accept the kwarg, and omitting is equivalent for motor.
    return {"session": session} if session is not None else {}


async def _resolve_folder_id(
    db: AsyncIOMotorDatabase,
    session: Any,
    user_object_id: ObjectId,
    path: list[str],
    now: datetime,
    folder_cache: dict[tuple[str, ...], ObjectId],
    inserted: _Inserted,
    meta: models.ImportFolder | None = None,
) -> ObjectId | None:
    """Find-or-create the folder chain for a path, from the importer's
    own workspace root. Cross-tenant placement is not a concept — the
    cache only ever holds folders of this user.

    `meta` (color + original timestamps) applies ONLY when the final
    segment is created fresh — restoring into a populated workspace
    must never rewrite existing folders' metadata.
    """
    current: ObjectId | None = None
    for depth, segment in enumerate(path):
        key = tuple(path[: depth + 1])
        cached = folder_cache.get(key)
        if cached is not None:
            current = cached
            continue
        existing = await db.folders.find_one(
            {
                "user_id": user_object_id,
                "name": segment,
                "parent_folder_id": current,
            },
            {"_id": 1},
            **_session_kwargs(session),
        )
        if existing is not None:
            current = existing["_id"]
        else:
            is_final = depth == len(path) - 1
            folder_doc = {
                "user_id": user_object_id,
                "parent_folder_id": current,
                "name": segment,
                "order": 0,
                "color": meta.color if (is_final and meta) else None,
                "created_at": (meta.created_at if (is_final and meta) else None) or now,
                "updated_at": (meta.updated_at if (is_final and meta) else None) or now,
            }
            result = await db.folders.insert_one(
                folder_doc, **_session_kwargs(session)
            )
            current = result.inserted_id
            inserted.folder_ids.append(current)
        folder_cache[key] = current
    return current


async def _insert_all(
    db: AsyncIOMotorDatabase,
    session: Any,
    user_id: str,
    manifest: models.ImportManifest,
    now: datetime,
    inserted: _Inserted,
) -> tuple[int, int]:
    """Insert every manifest folder + note. Parents first (paths sorted
    by depth), then notes. Fills `inserted` as it goes."""
    user_object_id = ObjectId(user_id)
    folder_cache: dict[tuple[str, ...], ObjectId] = {}

    ordered = sorted(
        enumerate(manifest.folders),
        key=lambda pair: (len(pair[1].path), pair[0]),
    )
    for _, folder in ordered:
        await _resolve_folder_id(
            db,
            session,
            user_object_id,
            [*folder.path, folder.name],
            now,
            folder_cache,
            inserted,
            meta=folder,
        )

    for note in manifest.notes:
        folder_id = await _resolve_folder_id(
            db, session, user_object_id, note.path, now, folder_cache, inserted
        )
        blocks, connections = _prepare_note_payload(note)
        note_doc = {
            "user_id": user_object_id,
            "folder_id": folder_id,
            "title": note.title,
            "layout_type": note.layout_type,
            "emoji_icon": note.emoji_icon,
            "color": note.color,
            "blocks": blocks,
            "block_connections": connections,
            "links_to": [],
            "backlinks": [],
            "is_published": False,
            "published_metadata": None,
            "created_at": note.created_at or now,
            "updated_at": note.updated_at or now,
        }
        result = await db.notes.insert_one(
            note_doc, **_session_kwargs(session)
        )
        inserted.note_ids.append(result.inserted_id)

    return len(inserted.note_ids), len(inserted.folder_ids)


async def _compensate(
    db: AsyncIOMotorDatabase, user_id: str, inserted: _Inserted
) -> None:
    """Fallback-path rollback: remove everything this import created."""
    user_object_id = ObjectId(user_id)
    if inserted.note_ids:
        await db.notes.delete_many(
            {"user_id": user_object_id, "_id": {"$in": inserted.note_ids}}
        )
    if inserted.folder_ids:
        await db.folders.delete_many(
            {"user_id": user_object_id, "_id": {"$in": inserted.folder_ids}}
        )


async def _transactions_supported(db: AsyncIOMotorDatabase) -> bool:
    """Real Mongo topology check: transactions need a replica set or a
    mongos. A STANDALONE mongod happily hands out sessions and then
    fails the first transactional command — probing `hello` (setName /
    isdbgrid) routes standalone deployments to the fallback instead of
    erroring mid-import."""
    try:
        hello = await db.command("hello")
    except Exception:
        return False
    if not isinstance(hello, dict):
        return False
    return bool(hello.get("setName")) or hello.get("msg") == "isdbgrid"


async def commit_manifest(
    db: AsyncIOMotorDatabase,
    user_id: str,
    manifest: models.ImportManifest,
    import_token: str | None = None,
) -> models.ImportCommitOut:
    """All-or-nothing commit. Fresh ObjectIds everywhere; ownership is
    always the importing user; folder placement is remapped by path.

    Idempotency: with a client `import_token`, a retry after a LOST
    RESPONSE (slow networks — the import committed but the client
    never saw it) replays the stored receipt instead of importing
    again. A genuinely failed import writes no receipt, so retrying it
    re-executes cleanly.
    """

    def result(notes_count: int, folders_count: int) -> models.ImportCommitOut:
        return models.ImportCommitOut(
            folders=folders_count,
            notes=notes_count,
            message=f"Imported {notes_count} note{'s' if notes_count != 1 else ''}, "
            f"{folders_count} folder{'s' if folders_count != 1 else ''}",
        )

    async def find_receipt() -> models.ImportCommitOut | None:
        receipt = await db.import_receipts.find_one(
            {"user_id": ObjectId(user_id), "token": import_token}
        )
        if receipt is None:
            return None
        return result(receipt["notes"], receipt["folders"])

    if import_token is not None:
        replay = await find_receipt()
        if replay is not None:
            return replay
    # Replays are free; only fresh imports consume the rate limit.
    check_rate_limit(user_id)

    inserted = _Inserted()
    now = utc_now()

    # mongomock raises on start_session; a standalone mongod accepts
    # sessions but rejects transactions — hence the topology probe.
    session = None
    if await _transactions_supported(db):
        try:
            session = await db.client.start_session()
        except Exception:
            session = None

    if session is not None:
        try:
            async with session:
                async with session.start_transaction():
                    notes_count, folders_count = await _insert_all(
                        db, session, user_id, manifest, now, inserted
                    )
                    if import_token is not None:
                        await db.import_receipts.insert_one(
                            {
                                "user_id": ObjectId(user_id),
                                "token": import_token,
                                "notes": notes_count,
                                "folders": folders_count,
                                "created_at": now,
                            },
                            session=session,
                        )
        except DuplicateKeyError:
            # Concurrent same-token commit — the other request won the
            # unique (user_id, token) index; replay its result.
            replay = await find_receipt()
            if replay is not None:
                return replay
            raise
    else:
        try:
            notes_count, folders_count = await _insert_all(
                db, None, user_id, manifest, now, inserted
            )
        except Exception:
            await _compensate(db, user_id, inserted)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Import failed — nothing was committed",
            )
        # Receipt goes in AFTER success: a compensated failure leaves
        # nothing behind, so retrying it re-executes cleanly. (A
        # concurrent duplicate on this non-transactional path is not
        # dedupable — the UI disables the button while committing.)
        if import_token is not None:
            try:
                await db.import_receipts.insert_one(
                    {
                        "user_id": ObjectId(user_id),
                        "token": import_token,
                        "notes": notes_count,
                        "folders": folders_count,
                        "created_at": now,
                    }
                )
            except DuplicateKeyError:
                replay = await find_receipt()
                if replay is None:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Import already in progress — try again",
                    )
                await _compensate(db, user_id, inserted)
                return replay

    return result(notes_count, folders_count)
