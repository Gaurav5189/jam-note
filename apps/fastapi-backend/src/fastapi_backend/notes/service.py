"""Notes service — all mutations go through the transactional outbox.

Phase 8 rule (OUTBOX_STREAMER_IMPLEMENTATION_PLAN_V3.md §5):
  Every note create / update / soft-delete / restore / purge writes the
  business mutation AND the outbox event in ONE MongoDB transaction, with the
  owner filter on every write. FastAPI never talks to Kafka.

Event mapping:
  create / update / restore  →  note.changed  (changed_fields = $set keys)
  soft_delete_note           →  note.deleted  (for trashed notes with content)
  purge_note                 →  note.deleted  (hard delete / empty-note purge)

``note.published`` is reserved in the schema, not emitted here (post-8).
"""

import re
from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from fastapi_backend.notes.models import NoteCreate, NoteUpdate
from fastapi_backend.events.outbox import record_note_event, transaction_or_fallback

# Fields returned for list/tree/search reads — block payloads are heavy and
# unnecessary when rendering the sidebar index.
LIST_PROJECTION = {
    "_id": 1,
    "user_id": 1,
    "folder_id": 1,
    "title": 1,
    "layout_type": 1,
    "emoji_icon": 1,
    "color": 1,
    "is_published": 1,
    "is_pinned": 1,
    "read_only": 1,
    "created_at": 1,
    "updated_at": 1,
}

SEARCH_RESULTS_LIMIT = 20


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


async def create_note(
    db: AsyncIOMotorDatabase, user_id: str, data: NoteCreate
) -> dict[str, Any]:
    """Insert a new note for a user, optionally inside a folder.

    The insert and the outbox event are written in one transaction (or
    sequentially with the fallback path — see ``transaction_or_fallback``).
    """
    user_object_id = ObjectId(user_id)

    folder_object_id: ObjectId | None = None
    if data.folder_id is not None:
        try:
            folder_object_id = ObjectId(data.folder_id)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid folder_id format",
            )
        # Ownership check on the folder prevents filing a note under
        # another user's folder even when its id is known.
        folder_doc = await db.folders.find_one(
            {"_id": folder_object_id, "user_id": user_object_id},
            {"_id": 1},
        )
        if not folder_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Folder not found",
            )

    now = utc_now()
    note_doc = {
        "user_id": user_object_id,
        "folder_id": folder_object_id,
        "title": data.title,
        "layout_type": data.layout_type,
        "emoji_icon": data.emoji_icon,
        "color": data.color,
        "blocks": [block.model_dump() for block in data.blocks],
        "block_connections": [
            conn.model_dump() for conn in data.block_connections
        ],
        "links_to": [],
        "backlinks": [],
        "is_published": False,
        "is_pinned": False,
        "read_only": False,
        # Populated by the Phase 5 publishing hub; null keeps the unique
        # sparse index on `published_metadata.slug` inactive for this note.
        "published_metadata": None,
        "created_at": now,
        "updated_at": now,
    }

    # Compute changed_fields from the supplied create payload.
    changed_fields = ["title", "blocks"]
    if data.folder_id is not None:
        changed_fields.append("folder_id")
    if data.layout_type != "document":
        changed_fields.append("layout_type")
    if data.emoji_icon is not None:
        changed_fields.append("emoji_icon")
    if data.color is not None:
        changed_fields.append("color")
    if data.block_connections:
        changed_fields.append("block_connections")

    async with transaction_or_fallback(db) as session:
        sess_kwargs: dict[str, Any] = {"session": session} if session is not None else {}
        result = await db.notes.insert_one(note_doc, **sess_kwargs)
        inserted_id = result.inserted_id

        await record_note_event(
            db,
            event_type="note.changed",
            note_id=inserted_id,
            user_id=user_object_id,
            changed_fields=changed_fields,
            updated_at=now,
            session=session,
        )

    created_doc = await db.notes.find_one({"_id": inserted_id})
    if not created_doc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Note creation failed",
        )
    return created_doc


async def list_notes(db: AsyncIOMotorDatabase, user_id: str) -> list[dict[str, Any]]:
    """Fetch all of a user's live notes (no blocks), ordered by creation time.

    Soft-deleted notes (Phase 7 trash) are excluded everywhere content
    is listed; they are only reachable via the trash endpoints.
    """
    cursor = (
        db.notes.find(
            {"user_id": ObjectId(user_id), "deleted_at": None},
            LIST_PROJECTION,
        )
        .sort("created_at", 1)
    )
    return [doc async for doc in cursor]


async def list_notes_full(
    db: AsyncIOMotorDatabase, user_id: str
) -> list[dict[str, Any]]:
    """All of a user's live notes including block payloads.

    The export path needs full documents; the sidebar/list path uses the
    projectioned `list_notes`. Trashed notes are excluded (exports never
    carry trash — import_export_DESIGN §2).
    """
    cursor = (
        db.notes.find({"user_id": ObjectId(user_id), "deleted_at": None})
        .sort("created_at", 1)
    )
    return [doc async for doc in cursor]


async def search_notes(
    db: AsyncIOMotorDatabase, user_id: str, query: str
) -> list[dict[str, Any]]:
    """Case-insensitive title search for the command palette.

    Results are ordered by most recently updated, capped so the palette
    stays snappy on large workspaces. Trashed notes never surface.
    """
    cursor = (
        db.notes.find(
            {
                "user_id": ObjectId(user_id),
                "deleted_at": None,
                # re.escape prevents user input from being interpreted as
                # regex operators.
                "title": {"$regex": re.escape(query), "$options": "i"},
            },
            LIST_PROJECTION,
        )
        .sort("updated_at", -1)
        .limit(SEARCH_RESULTS_LIMIT)
    )
    return [doc async for doc in cursor]


def _canvas_only_blocks_change(
    stored: list[dict[str, Any]], incoming: list[Any]
) -> bool:
    """True when incoming blocks differ from the stored ones ONLY in
    `canvas_metadata` (node positions/dimensions — the spatial surface).
    Text, type, id, property, or count changes are CONTENT."""
    if len(stored) != len(incoming):
        return False
    for old_block, new_block in zip(stored, incoming):
        old = {k: v for k, v in old_block.items() if k != "canvas_metadata"}
        new = {
            k: v for k, v in new_block.model_dump().items() if k != "canvas_metadata"
        }
        if old != new:
            return False
    return True


async def update_note(
    db: AsyncIOMotorDatabase, note_doc: dict[str, Any], data: NoteUpdate
) -> dict[str, Any]:
    """Replace the fields provided in a partial update.

    Read-only locks the DOCUMENT (title + prose content): renames and
    text/type/block-list changes are rejected while locked. The canvas
    stays fully live — spatial saves (canvas_metadata positions,
    block_connections) are allowed, since dragging a node must never
    produce a sync error. Layout switching stays allowed (presentation,
    not content), as do folder moves, accents, pins, and the request
    that lifts the lock itself.

    The note mutation and the outbox event are written in one transaction.
    """
    content_locked = bool(note_doc.get("read_only"))
    if content_locked and "read_only" not in data.model_fields_set:
        if "title" in data.model_fields_set:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Note is read-only — lift the lock first",
            )
        if (
            "blocks" in data.model_fields_set
            and data.blocks is not None
            and not _canvas_only_blocks_change(
                note_doc.get("blocks") or [], data.blocks
            )
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Note is read-only — lift the lock first",
            )

    update_fields: dict[str, Any] = {"updated_at": utc_now()}
    if data.title is not None:
        update_fields["title"] = data.title
    if "folder_id" in data.model_fields_set:
        if data.folder_id is None:
            # Explicit null = move to the workspace root.
            update_fields["folder_id"] = None
        else:
            try:
                folder_object_id = ObjectId(data.folder_id)
            except Exception:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid folder_id format",
                )
            folder_doc = await db.folders.find_one(
                {"_id": folder_object_id, "user_id": note_doc["user_id"]},
                {"_id": 1},
            )
            if not folder_doc:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Folder not found",
                )
            update_fields["folder_id"] = folder_object_id
    if data.layout_type is not None:
        update_fields["layout_type"] = data.layout_type
    if data.emoji_icon is not None:
        update_fields["emoji_icon"] = data.emoji_icon
    # Accent: omitted keeps the current color, explicit null clears it.
    if "color" in data.model_fields_set:
        update_fields["color"] = data.color
    if data.blocks is not None:
        update_fields["blocks"] = [block.model_dump() for block in data.blocks]
    if data.block_connections is not None:
        update_fields["block_connections"] = [
            conn.model_dump() for conn in data.block_connections
        ]
    if data.is_pinned is not None:
        update_fields["is_pinned"] = data.is_pinned
    if data.read_only is not None:
        update_fields["read_only"] = data.read_only

    # changed_fields excludes the internal `updated_at` timestamp — the
    # downstream indexer cares about content fields, not the timestamp.
    changed_fields = [k for k in update_fields if k != "updated_at"]

    note_object_id: ObjectId = note_doc["_id"]
    user_object_id: ObjectId = note_doc["user_id"]

    async with transaction_or_fallback(db) as session:
        sess_kwargs: dict[str, Any] = {"session": session} if session is not None else {}
        result = await db.notes.update_one(
            {"_id": note_object_id, "user_id": user_object_id},
            {"$set": update_fields},
            **sess_kwargs,
        )
        if result.matched_count != 1:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Note update failed",
            )

        await record_note_event(
            db,
            event_type="note.changed",
            note_id=note_object_id,
            user_id=user_object_id,
            changed_fields=changed_fields,
            updated_at=update_fields["updated_at"],
            session=session,
        )

    updated_doc = await db.notes.find_one({"_id": note_object_id})
    if not updated_doc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Note update failed",
        )
    return updated_doc


def is_note_empty(note_doc: dict[str, Any]) -> bool:
    """True when a note carries no meaningful content: no blocks at
    all, or every block renders nothing (blank text; image/drawing
    without a source; dividers never count). Empty notes skip the
    trash on DELETE (user decision) — there is nothing to restore, so
    they are shredded immediately instead of cluttering the trash."""
    blocks = note_doc.get("blocks") or []
    for block in blocks:
        block_type = block.get("type", "text")
        properties = block.get("properties") or {}
        if block_type == "divider":
            continue
        if block_type in {"image", "drawing"}:
            if properties.get("src"):
                return False
            continue
        if str(properties.get("text") or "").strip():
            return False
    return True


async def soft_delete_note(
    db: AsyncIOMotorDatabase, note_doc: dict[str, Any]
) -> datetime:
    """File a note into the trash by stamping `deleted_at`.

    The document stays intact (fully restorable) until the TTL index
    purges it 30 days later. Notes are leaves — nothing to lift.

    The stamp write and outbox event are committed in one transaction.
    """
    deleted_at = utc_now()
    note_object_id: ObjectId = note_doc["_id"]
    user_object_id: ObjectId = note_doc["user_id"]

    async with transaction_or_fallback(db) as session:
        sess_kwargs: dict[str, Any] = {"session": session} if session is not None else {}
        await db.notes.update_one(
            {"_id": note_object_id, "user_id": user_object_id},
            {"$set": {"deleted_at": deleted_at}},
            **sess_kwargs,
        )
        await record_note_event(
            db,
            event_type="note.deleted",
            note_id=note_object_id,
            user_id=user_object_id,
            changed_fields=[],
            updated_at=deleted_at,
            session=session,
        )

    return deleted_at


async def list_trashed_notes(
    db: AsyncIOMotorDatabase, user_id: str
) -> list[dict[str, Any]]:
    """Soft-deleted notes, most recently trashed first."""
    cursor = (
        db.notes.find(
            {
                "user_id": ObjectId(user_id),
                "deleted_at": {"$ne": None},
            },
            {**LIST_PROJECTION, "deleted_at": 1},
        )
        .sort("deleted_at", -1)
    )
    return [doc async for doc in cursor]


async def restore_note(
    db: AsyncIOMotorDatabase, note_doc: dict[str, Any]
) -> dict[str, Any]:
    """Clear `deleted_at`, returning the note to the workspace.

    A dangling folder reference (the folder was deleted while the note
    sat in the trash) restores the note to the workspace root — the
    same guarantee the workspace tree gives missing parents.

    The restore write and outbox event are committed in one transaction.
    """
    folder_doc = None
    folder_id = note_doc.get("folder_id")
    if folder_id is not None:
        folder_doc = await db.folders.find_one(
            {"_id": folder_id, "user_id": note_doc["user_id"]},
            {"_id": 1},
        )

    now = utc_now()
    note_object_id: ObjectId = note_doc["_id"]
    user_object_id: ObjectId = note_doc["user_id"]
    resolved_folder_id = folder_id if folder_doc else None

    update_fields = {
        "deleted_at": None,
        # Missing folder → restore at the workspace root.
        "folder_id": resolved_folder_id,
        "updated_at": now,
    }

    async with transaction_or_fallback(db) as session:
        sess_kwargs: dict[str, Any] = {"session": session} if session is not None else {}
        await db.notes.update_one(
            {"_id": note_object_id, "user_id": user_object_id},
            {"$set": update_fields},
            **sess_kwargs,
        )
        await record_note_event(
            db,
            event_type="note.changed",
            note_id=note_object_id,
            user_id=user_object_id,
            changed_fields=["deleted_at", "folder_id"],
            updated_at=now,
            session=session,
        )

    restored = await db.notes.find_one({"_id": note_object_id})
    if not restored:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Note restore failed",
        )
    return restored


async def purge_note(db: AsyncIOMotorDatabase, note_doc: dict[str, Any]) -> None:
    """Permanently remove a note (trash purge or empty-note shred).

    The hard delete and outbox event are committed in one transaction.
    """
    note_object_id: ObjectId = note_doc["_id"]
    user_object_id: ObjectId = note_doc["user_id"]
    now = utc_now()

    async with transaction_or_fallback(db) as session:
        sess_kwargs: dict[str, Any] = {"session": session} if session is not None else {}
        await db.notes.delete_one(
            {"_id": note_object_id, "user_id": user_object_id},
            **sess_kwargs,
        )
        await record_note_event(
            db,
            event_type="note.deleted",
            note_id=note_object_id,
            user_id=user_object_id,
            changed_fields=[],
            updated_at=now,
            session=session,
        )
