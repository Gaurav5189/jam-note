import re
from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from fastapi_backend.notes.models import NoteCreate, NoteTreeItem, NoteUpdate

# Fields returned for list/tree/search reads — block payloads are heavy and
# unnecessary when rendering the sidebar index.
LIST_PROJECTION = {
    "_id": 1,
    "user_id": 1,
    "parent_id": 1,
    "title": 1,
    "layout_type": 1,
    "emoji_icon": 1,
    "is_published": 1,
    "created_at": 1,
    "updated_at": 1,
}

SEARCH_RESULTS_LIMIT = 20


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


async def create_note(
    db: AsyncIOMotorDatabase, user_id: str, data: NoteCreate
) -> dict[str, Any]:
    """Insert a new note for a user, optionally nested under a parent note."""
    user_object_id = ObjectId(user_id)

    parent_object_id: ObjectId | None = None
    if data.parent_id is not None:
        try:
            parent_object_id = ObjectId(data.parent_id)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid parent_id format",
            )
        # Ownership check on the parent prevents nesting under another
        # user's note even when its id is known.
        parent_doc = await db.notes.find_one(
            {"_id": parent_object_id, "user_id": user_object_id},
            {"_id": 1},
        )
        if not parent_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Parent note not found",
            )

    now = utc_now()
    note_doc = {
        "user_id": user_object_id,
        "parent_id": parent_object_id,
        "title": data.title,
        "layout_type": data.layout_type,
        "emoji_icon": data.emoji_icon,
        "blocks": [block.model_dump() for block in data.blocks],
        "block_connections": [
            conn.model_dump() for conn in data.block_connections
        ],
        "links_to": [],
        "backlinks": [],
        "is_published": False,
        # Populated by the Phase 5 publishing hub; null keeps the unique
        # sparse index on `published_metadata.slug` inactive for this note.
        "published_metadata": None,
        "created_at": now,
        "updated_at": now,
    }

    result = await db.notes.insert_one(note_doc)
    created_doc = await db.notes.find_one({"_id": result.inserted_id})
    if not created_doc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Note creation failed",
        )
    return created_doc


async def list_notes(db: AsyncIOMotorDatabase, user_id: str) -> list[dict[str, Any]]:
    """Fetch all of a user's notes (no blocks), ordered by creation time."""
    cursor = (
        db.notes.find({"user_id": ObjectId(user_id)}, LIST_PROJECTION)
        .sort("created_at", 1)
    )
    return [doc async for doc in cursor]


async def search_notes(
    db: AsyncIOMotorDatabase, user_id: str, query: str
) -> list[dict[str, Any]]:
    """Case-insensitive title search for the command palette.

    Results are ordered by most recently updated, capped so the palette
    stays snappy on large workspaces.
    """
    cursor = (
        db.notes.find(
            {
                "user_id": ObjectId(user_id),
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


async def update_note(
    db: AsyncIOMotorDatabase, note_doc: dict[str, Any], data: NoteUpdate
) -> dict[str, Any]:
    """Replace the fields provided in a partial update."""
    update_fields: dict[str, Any] = {"updated_at": utc_now()}
    if data.title is not None:
        update_fields["title"] = data.title
    if data.layout_type is not None:
        update_fields["layout_type"] = data.layout_type
    if data.emoji_icon is not None:
        update_fields["emoji_icon"] = data.emoji_icon
    if data.blocks is not None:
        update_fields["blocks"] = [block.model_dump() for block in data.blocks]
    if data.block_connections is not None:
        update_fields["block_connections"] = [
            conn.model_dump() for conn in data.block_connections
        ]

    await db.notes.update_one({"_id": note_doc["_id"]}, {"$set": update_fields})
    updated_doc = await db.notes.find_one({"_id": note_doc["_id"]})
    if not updated_doc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Note update failed",
        )
    return updated_doc


async def delete_note(db: AsyncIOMotorDatabase, note_doc: dict[str, Any]) -> None:
    """Delete a note and reparent its children to the note's own parent.

    Children are lifted BEFORE the delete so they are never orphaned, even
    if the delete fails midway (standalone MongoDB deployments do not
    support multi-document transactions).
    """
    await db.notes.update_many(
        {"parent_id": note_doc["_id"], "user_id": note_doc["user_id"]},
        {"$set": {"parent_id": note_doc["parent_id"], "updated_at": utc_now()}},
    )
    await db.notes.delete_one({"_id": note_doc["_id"], "user_id": note_doc["user_id"]})


def build_tree(note_docs: list[dict[str, Any]]) -> list[NoteTreeItem]:
    """Convert a flat list of note documents into a nested tree.

    Children attach to their parents in creation order. A note referencing
    a missing parent (e.g. the parent was removed outside the API) is
    treated as a root so it stays visible in the sidebar.
    """
    items: dict[str, NoteTreeItem] = {}
    for doc in note_docs:
        item_id = str(doc["_id"])
        items[item_id] = NoteTreeItem(
            id=item_id,
            parent_id=str(doc["parent_id"]) if doc.get("parent_id") is not None else None,
            title=doc["title"],
            layout_type=doc.get("layout_type", "document"),
            emoji_icon=doc.get("emoji_icon"),
            is_published=doc.get("is_published", False),
            created_at=doc["created_at"],
            updated_at=doc["updated_at"],
        )

    roots: list[NoteTreeItem] = []
    for item in items.values():
        if item.parent_id is not None and item.parent_id in items:
            items[item.parent_id].children.append(item)
        else:
            roots.append(item)
    return roots
