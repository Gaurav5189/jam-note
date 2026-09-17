from typing import Annotated

from fastapi import APIRouter, Query, status

from fastapi_backend.auth.dependencies import CurrentUserDep
from fastapi_backend.notes.dependencies import DbDep, OwnedNoteDep
from fastapi_backend.notes.models import (
    NoteCreate,
    NoteListItem,
    NoteOut,
    NoteTreeItem,
    NoteUpdate,
)
from fastapi_backend.notes import service

router = APIRouter(
    prefix="/notes",
    tags=["notes"],
)

# NOTE: "/trees" and "/search" are declared before "/{note_id}" so they are
# not captured by the dynamic path parameter.


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


@router.get("/trees")
async def list_note_trees(
    current_user: CurrentUserDep,
    db: DbDep,
) -> list[NoteTreeItem]:
    note_docs = await service.list_notes(db, current_user.id)
    return service.build_tree(note_docs)


@router.get("/search")
async def search_notes(
    q: Annotated[str, Query(min_length=1, max_length=100)],
    current_user: CurrentUserDep,
    db: DbDep,
) -> list[NoteListItem]:
    note_docs = await service.search_notes(db, current_user.id, q)
    return [NoteListItem.from_mongo(doc) for doc in note_docs]


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


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    note_doc: OwnedNoteDep,
    db: DbDep,
) -> None:
    await service.delete_note(db, note_doc)
