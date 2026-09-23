import json
from typing import Annotated, Literal

from fastapi import APIRouter, Query, Response, status
from fastapi.responses import StreamingResponse

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
from fastapi_backend.exporting import service as export_service

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


@router.get("/{folder_id}/export")
async def export_folder(
    folder_doc: OwnedFolderDep,
    db: DbDep,
    format: Annotated[Literal["zip", "json"], Query()],
) -> Response:
    """Folder export (the Profile picker's folder row).

    `zip` = one markdown file per contained note, wrapped in the
    folder's directory tree (sharing); `json` = a single backup
    manifest of the subtree (restorable via import).
    """
    user_id = str(folder_doc["user_id"])
    folder_docs = await service.list_folders(db, user_id)
    note_docs = await notes_service.list_notes_full(db, user_id)

    if format == "json":
        manifest = export_service.build_manifest(
            folder_docs, note_docs, root_folder_id=folder_doc["_id"]
        )
        filename = f"{export_service.slugify(folder_doc['name'])}.json"
        return Response(
            content=json.dumps(manifest, ensure_ascii=False, indent=2),
            media_type="application/json",
            headers={
                "Content-Disposition": export_service.content_disposition(filename)
            },
        )

    spool, filename = export_service.build_zip(
        folder_docs, note_docs, root_folder_id=folder_doc["_id"]
    )
    return StreamingResponse(
        export_service.iter_zip_chunks(spool),
        media_type="application/zip",
        headers={
            "Content-Disposition": export_service.content_disposition(filename)
        },
    )


@workspace_router.get("/workspace")
async def get_workspace(
    current_user: CurrentUserDep,
    db: DbDep,
) -> WorkspaceOut:
    folder_docs = await service.list_folders(db, current_user.id)
    note_docs = await notes_service.list_notes(db, current_user.id)
    return service.build_workspace_tree(folder_docs, note_docs)
