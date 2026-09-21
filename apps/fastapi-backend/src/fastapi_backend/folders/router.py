from fastapi import APIRouter, status

from fastapi_backend.auth.dependencies import CurrentUserDep
from fastapi_backend.folders.dependencies import DbDep, OwnedFolderDep
from fastapi_backend.folders.models import (
    FolderCreate,
    FolderOut,
    FolderUpdate,
    WorkspaceOut,
)
from fastapi_backend.folders import service
from fastapi_backend.notes import service as notes_service

router = APIRouter(
    prefix="/folders",
    tags=["folders"],
)

# The workspace route is not under /folders, so it lives on its own tiny
# router (registered alongside the folders router with the /api prefix).
workspace_router = APIRouter(tags=["workspace"])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_folder(
    folder_data: FolderCreate,
    current_user: CurrentUserDep,
    db: DbDep,
) -> FolderOut:
    created_doc = await service.create_folder(db, current_user.id, folder_data)
    return FolderOut.from_mongo(created_doc)


@router.get("")
async def list_folders(
    current_user: CurrentUserDep,
    db: DbDep,
) -> list[FolderOut]:
    folder_docs = await service.list_folders(db, current_user.id)
    return [FolderOut.from_mongo(doc) for doc in folder_docs]


@router.get("/{folder_id}")
async def get_folder(folder_doc: OwnedFolderDep) -> FolderOut:
    return FolderOut.from_mongo(folder_doc)


@router.put("/{folder_id}")
async def update_folder(
    folder_data: FolderUpdate,
    folder_doc: OwnedFolderDep,
    db: DbDep,
) -> FolderOut:
    updated_doc = await service.update_folder(db, folder_doc, folder_data)
    return FolderOut.from_mongo(updated_doc)


@router.delete("/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_folder(
    folder_doc: OwnedFolderDep,
    db: DbDep,
) -> None:
    await service.delete_folder(db, folder_doc)


@workspace_router.get("/workspace")
async def get_workspace(
    current_user: CurrentUserDep,
    db: DbDep,
) -> WorkspaceOut:
    folder_docs = await service.list_folders(db, current_user.id)
    note_docs = await notes_service.list_notes(db, current_user.id)
    return service.build_workspace_tree(folder_docs, note_docs)
