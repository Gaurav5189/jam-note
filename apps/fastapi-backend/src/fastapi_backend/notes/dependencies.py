from typing import Annotated, Any

from bson import ObjectId
from fastapi import Depends, HTTPException, Path, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from fastapi_backend.database import get_db
from fastapi_backend.auth.dependencies import CurrentUserDep

DbDep = Annotated[AsyncIOMotorDatabase, Depends(get_db)]


def parse_object_id(value: str) -> ObjectId:
    """Convert a hex string to an ObjectId.

    Invalid ids raise 404 (not 400) so the API never leaks whether an id
    exists for another tenant.
    """
    try:
        return ObjectId(value)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found",
        )


async def get_owned_note(
    note_id: Annotated[str, Path()],
    current_user: CurrentUserDep,
    db: DbDep,
) -> dict[str, Any]:
    """Resolve a note path parameter and verify ownership.

    Every read/mutation on a single note flows through this dependency so
    the `user_id` filter is impossible to forget. Foreign or missing notes
    are both 404 to avoid leaking their existence. Trashed notes
    (`deleted_at` set) are also 404 here — the live API pretends they
    don't exist; only the trash endpoints resolve them.
    """
    note_doc = await db.notes.find_one(
        {
            "_id": parse_object_id(note_id),
            "user_id": ObjectId(current_user.id),
            "deleted_at": None,
        }
    )
    if not note_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found",
        )
    return note_doc


async def get_trashed_note(
    note_id: Annotated[str, Path()],
    current_user: CurrentUserDep,
    db: DbDep,
) -> dict[str, Any]:
    """Resolve a note that sits in the trash (restore/purge only).

    Live notes are 404 here — the purge endpoint must never hard-delete
    a note the user can still see in their workspace.
    """
    note_doc = await db.notes.find_one(
        {
            "_id": parse_object_id(note_id),
            "user_id": ObjectId(current_user.id),
            "deleted_at": {"$ne": None},
        }
    )
    if not note_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found",
        )
    return note_doc


OwnedNoteDep = Annotated[dict[str, Any], Depends(get_owned_note)]
TrashedNoteDep = Annotated[dict[str, Any], Depends(get_trashed_note)]
