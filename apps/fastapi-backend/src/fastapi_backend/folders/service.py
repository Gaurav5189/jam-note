from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from fastapi_backend.folders.models import (
    FolderCreate,
    FolderTreeItem,
    FolderUpdate,
    WorkspaceOut,
)
from fastapi_backend.notes.models import NoteListItem

# Fields returned for list/tree reads — mirrors notes.LIST_PROJECTION.
FOLDER_LIST_PROJECTION = {
    "_id": 1,
    "user_id": 1,
    "parent_folder_id": 1,
    "name": 1,
    "order": 1,
    "color": 1,
    "created_at": 1,
    "updated_at": 1,
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


async def create_folder(
    db: AsyncIOMotorDatabase, user_id: str, data: FolderCreate
) -> dict[str, Any]:
    """Insert a new folder for a user, optionally nested under a folder."""
    user_object_id = ObjectId(user_id)

    parent_object_id: ObjectId | None = None
    if data.parent_folder_id is not None:
        try:
            parent_object_id = ObjectId(data.parent_folder_id)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid parent_folder_id format",
            )
        # Ownership check on the parent prevents nesting under another
        # user's folder even when its id is known.
        parent_doc = await db.folders.find_one(
            {"_id": parent_object_id, "user_id": user_object_id},
            {"_id": 1},
        )
        if not parent_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Parent folder not found",
            )

    now = utc_now()
    folder_doc = {
        "user_id": user_object_id,
        "parent_folder_id": parent_object_id,
        "name": data.name,
        # Reserved for a future manual ordering phase — never written by
        # the API beyond this seed value.
        "order": 0,
        "color": data.color,
        "created_at": now,
        "updated_at": now,
    }

    result = await db.folders.insert_one(folder_doc)
    created_doc = await db.folders.find_one({"_id": result.inserted_id})
    if not created_doc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Folder creation failed",
        )
    return created_doc


async def list_folders(
    db: AsyncIOMotorDatabase, user_id: str
) -> list[dict[str, Any]]:
    """Fetch all of a user's folders, ordered by creation time."""
    cursor = (
        db.folders.find({"user_id": ObjectId(user_id)}, FOLDER_LIST_PROJECTION)
        .sort("created_at", 1)
    )
    return [doc async for doc in cursor]


async def _validate_move_target(
    db: AsyncIOMotorDatabase,
    user_id: str,
    folder_object_id: ObjectId,
    target_id: str,
) -> ObjectId:
    """Validate a folder move target: format, ownership, self, cycles.

    Returns the resolved ObjectId. Rejects moving a folder into itself
    or into any of its own descendants (a folder cycle). The walk up the
    parent chain uses a visited set so corrupted data containing an
    existing cycle terminates instead of looping.
    """
    if target_id == str(folder_object_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot move a folder into itself",
        )
    try:
        target_object_id = ObjectId(target_id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid parent_folder_id format",
        )

    current = await db.folders.find_one(
        {"_id": target_object_id, "user_id": ObjectId(user_id)},
        {"parent_folder_id": 1},
    )
    if not current:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Parent folder not found",
        )

    visited: set[ObjectId] = {target_object_id}
    while current is not None and current.get("parent_folder_id") is not None:
        parent_id = current["parent_folder_id"]
        if parent_id == folder_object_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Folder cycle",
            )
        if parent_id in visited:
            # Legacy cycle in stored data (impossible via the API) — stop
            # walking; the move itself would still be structurally sound.
            break
        visited.add(parent_id)
        current = await db.folders.find_one({"_id": parent_id}, {"parent_folder_id": 1})
    return target_object_id


async def update_folder(
    db: AsyncIOMotorDatabase, folder_doc: dict[str, Any], data: FolderUpdate
) -> dict[str, Any]:
    """Rename and/or move a folder, replacing only the provided fields.

    `model_fields_set` distinguishes an omitted `parent_folder_id` from
    an explicit null, so "move to the workspace root" stays expressible.
    """
    update_fields: dict[str, Any] = {"updated_at": utc_now()}
    fields_set = data.model_fields_set

    if "name" in fields_set and data.name is not None:
        update_fields["name"] = data.name

    if "parent_folder_id" in fields_set:
        if data.parent_folder_id is None:
            update_fields["parent_folder_id"] = None
        else:
            update_fields["parent_folder_id"] = await _validate_move_target(
                db,
                str(folder_doc["user_id"]),
                folder_doc["_id"],
                data.parent_folder_id,
            )

    # Accent: omitted keeps the current color, explicit null clears it.
    if "color" in fields_set:
        update_fields["color"] = data.color

    await db.folders.update_one({"_id": folder_doc["_id"]}, {"$set": update_fields})
    updated_doc = await db.folders.find_one({"_id": folder_doc["_id"]})
    if not updated_doc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Folder update failed",
        )
    return updated_doc


async def delete_folder(db: AsyncIOMotorDatabase, folder_doc: dict[str, Any]) -> None:
    """Delete a folder, lifting its contents to its own parent.

    Notes and sub-folders are lifted BEFORE the delete so nothing is ever
    orphaned, even if the delete fails midway (standalone MongoDB
    deployments do not support multi-document transactions). Folder
    deletion never cascades.
    """
    await db.notes.update_many(
        {"folder_id": folder_doc["_id"], "user_id": folder_doc["user_id"]},
        {
            "$set": {
                "folder_id": folder_doc.get("parent_folder_id"),
                "updated_at": utc_now(),
            }
        },
    )
    await db.folders.update_many(
        {"parent_folder_id": folder_doc["_id"], "user_id": folder_doc["user_id"]},
        {
            "$set": {
                "parent_folder_id": folder_doc.get("parent_folder_id"),
                "updated_at": utc_now(),
            }
        },
    )
    await db.folders.delete_one(
        {"_id": folder_doc["_id"], "user_id": folder_doc["user_id"]}
    )


def build_workspace_tree(
    folder_docs: list[dict[str, Any]], note_docs: list[dict[str, Any]]
) -> WorkspaceOut:
    """Convert flat folder + note documents into the nested workspace tree.

    Folders sort before notes at every level; each list keeps creation
    order. A note or folder referencing a missing parent (e.g. removed
    outside the API) surfaces as a root so it stays visible — the same
    guarantee the old note tree gave. Folders stuck in a parent cycle
    (impossible via the API) surface as roots too instead of vanishing.
    """
    items: dict[str, FolderTreeItem] = {}
    for doc in folder_docs:
        folder_id = str(doc["_id"])
        items[folder_id] = FolderTreeItem(
            id=folder_id,
            parent_folder_id=(
                str(doc["parent_folder_id"])
                if doc.get("parent_folder_id") is not None
                else None
            ),
            name=doc["name"],
            order=doc.get("order", 0),
            color=doc.get("color"),
            created_at=doc["created_at"],
            updated_at=doc["updated_at"],
        )

    # Attach notes to their folders (missing folder → root note).
    root_notes: list[NoteListItem] = []
    notes_by_folder: dict[str, list[NoteListItem]] = {}
    for doc in note_docs:
        item = NoteListItem.from_mongo(doc)
        if item.folder_id is not None and item.folder_id in items:
            notes_by_folder.setdefault(item.folder_id, []).append(item)
        else:
            root_notes.append(item)

    # Attach folders to their parents (missing parent → root folder).
    root_folders: list[FolderTreeItem] = []
    for item in items.values():
        if item.parent_folder_id is not None and item.parent_folder_id in items:
            items[item.parent_folder_id].folders.append(item)
        else:
            root_folders.append(item)

    # Cycle guard: any folder not reachable from a root is trapped in a
    # parent cycle — surface it as a root so content never disappears.
    reachable: set[str] = set()
    stack = [item.id for item in root_folders]
    while stack:
        folder_id = stack.pop()
        if folder_id in reachable:
            continue
        reachable.add(folder_id)
        stack.extend(child.id for child in items[folder_id].folders)
    for item in items.values():
        if item.id not in reachable:
            # Detach from the cycle's parent list and surface as a root.
            root_folders.append(item)

    # Notes may have been appended out of creation order when cycle
    # victims surface — re-sort the roots to keep the contract.
    root_folders.sort(key=lambda item: item.created_at)

    for item in items.values():
        item.notes = notes_by_folder.get(item.id, [])

    return WorkspaceOut(folders=root_folders, notes=root_notes)
