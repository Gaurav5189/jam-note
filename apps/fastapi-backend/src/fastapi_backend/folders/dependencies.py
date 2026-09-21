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
            detail="Folder not found",
        )


async def get_owned_folder(
    folder_id: Annotated[str, Path()],
    current_user: CurrentUserDep,
    db: DbDep,
) -> dict[str, Any]:
    """Resolve a folder path parameter and verify ownership.

    Every read/mutation on a single folder flows through this dependency
    so the `user_id` filter is impossible to forget. Foreign or missing
    folders are both 404 to avoid leaking their existence.
    """
    folder_doc = await db.folders.find_one(
        {
            "_id": parse_object_id(folder_id),
            "user_id": ObjectId(current_user.id),
        }
    )
    if not folder_doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Folder not found",
        )
    return folder_doc


OwnedFolderDep = Annotated[dict[str, Any], Depends(get_owned_folder)]
