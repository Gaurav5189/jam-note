import json
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Query, Response, status
from fastapi.responses import StreamingResponse

from fastapi_backend.auth.dependencies import CurrentUserDep
from fastapi_backend.notes.dependencies import DbDep, OwnedNoteDep, TrashedNoteDep
from fastapi_backend.notes.models import (
    NoteCreate,
    NoteListItem,
    NoteOut,
    NoteUpdate,
    TrashItem,
)
from fastapi_backend.notes import service
from fastapi_backend.folders import service as folders_service
from fastapi_backend.exporting import service as export_service

router = APIRouter(
    prefix="/notes",
    tags=["notes"],
)

# NOTE: "/search", "/trash" and "/export" are declared before
# "/{note_id}" so they are not captured by the dynamic path parameter.


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_note(
    note_data: NoteCreate,
    current_user: CurrentUserDep,
    db: DbDep,
) -> NoteOut:
    created_doc = await service.create_note(db, current_user.id, note_data)
    return NoteOut.from_mongo(created_doc)


@router.get("")
async def list_notes(
    current_user: CurrentUserDep,
    db: DbDep,
) -> list[NoteListItem]:
    note_docs = await service.list_notes(db, current_user.id)
    return [NoteListItem.from_mongo(doc) for doc in note_docs]


@router.get("/search")
async def search_notes(
    q: Annotated[str, Query(min_length=1, max_length=100)],
    current_user: CurrentUserDep,
    db: DbDep,
) -> list[NoteListItem]:
    note_docs = await service.search_notes(db, current_user.id, q)
    return [NoteListItem.from_mongo(doc) for doc in note_docs]


@router.get("/trash")
async def list_trash(
    current_user: CurrentUserDep,
    db: DbDep,
) -> list[TrashItem]:
    """Soft-deleted notes for the Profile trash view (newest first)."""
    note_docs = await service.list_trashed_notes(db, current_user.id)
    return [TrashItem.from_mongo(doc) for doc in note_docs]


@router.get("/export")
async def export_workspace(
    current_user: CurrentUserDep,
    db: DbDep,
    format: Annotated[Literal["zip", "json"], Query()],
) -> Response:
    """Full-workspace export (API-level; the Profile picker exports per
    note/folder). `zip` = one markdown file per note mirroring the
    folder tree; `json` = the backup manifest (import prerequisite)."""
    folder_docs = await folders_service.list_folders(db, current_user.id)
    note_docs = await service.list_notes_full(db, current_user.id)

    if format == "json":
        manifest = export_service.build_manifest(folder_docs, note_docs)
        filename = "workspace-backup.json"
        content = json.dumps(manifest, ensure_ascii=False, indent=2)
        return Response(
            content=content,
            media_type="application/json",
            headers={
                "Content-Disposition": export_service.content_disposition(filename)
            },
        )

    spool, filename = export_service.build_zip(folder_docs, note_docs)
    return StreamingResponse(
        export_service.iter_zip_chunks(spool),
        media_type="application/zip",
        headers={
            "Content-Disposition": export_service.content_disposition(filename)
        },
    )


@router.get("/{note_id}")
async def get_note(note_doc: OwnedNoteDep) -> NoteOut:
    return NoteOut.from_mongo(note_doc)


@router.put("/{note_id}")
async def update_note(
    note_data: NoteUpdate,
    note_doc: OwnedNoteDep,
    db: DbDep,
) -> NoteOut:
    updated_doc = await service.update_note(db, note_doc, note_data)
    return NoteOut.from_mongo(updated_doc)


@router.delete("/{note_id}")
async def delete_note(
    note_doc: OwnedNoteDep,
    db: DbDep,
) -> dict[str, Any]:
    """File the note into the trash (30-day retention) — unless it is
    empty: notes with no meaningful content are deleted permanently
    right away (nothing to restore, no trash clutter)."""
    if service.is_note_empty(note_doc):
        await service.purge_note(db, note_doc)
        return {"purged": True, "message": "Empty note deleted permanently."}
    await service.soft_delete_note(db, note_doc)
    return {"purged": False, "message": "Note filed to trash — purged after 30 days."}


@router.get("/{note_id}/export")
async def export_note(
    note_doc: OwnedNoteDep,
    db: DbDep,
    format: Annotated[Literal["md", "json"], Query()],
    include_canvas_json: Annotated[bool, Query()] = False,
) -> Response:
    """Single-note export. `md` shares; `json` is the lossless backup
    (the manifest envelope, directly restorable via import)."""
    if format == "json":
        folder_docs = await folders_service.list_folders(
            db, str(note_doc["user_id"])
        )
        manifest = export_service.build_note_manifest(folder_docs, note_doc)
        filename = f"{export_service.slugify(note_doc.get('title') or 'untitled')}.json"
        return Response(
            content=json.dumps(manifest, ensure_ascii=False, indent=2),
            media_type="application/json",
            headers={
                "Content-Disposition": export_service.content_disposition(filename)
            },
        )

    markdown = export_service.note_to_markdown(note_doc, include_canvas_json)
    filename = f"{export_service.slugify(note_doc.get('title') or 'untitled')}.md"
    return Response(
        content=markdown,
        media_type="text/markdown; charset=utf-8",
        headers={
            "Content-Disposition": export_service.content_disposition(filename)
        },
    )


@router.post("/{note_id}/restore")
async def restore_note(
    note_doc: TrashedNoteDep,
    db: DbDep,
) -> NoteOut:
    """Pull a trashed note back into the workspace."""
    restored_doc = await service.restore_note(db, note_doc)
    return NoteOut.from_mongo(restored_doc)


@router.post("/{note_id}/purge", status_code=status.HTTP_204_NO_CONTENT)
async def purge_note(
    note_doc: TrashedNoteDep,
    db: DbDep,
) -> None:
    """Permanently delete a trashed note (immediate, irrecoverable)."""
    await service.purge_note(db, note_doc)
