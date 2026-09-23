"""Phase 7 trash / soft-delete lifecycle tests."""

import io
import zipfile
from datetime import datetime

import pytest
from bson import ObjectId
from httpx import AsyncClient
from motor.motor_asyncio import AsyncIOMotorDatabase

from fastapi_backend.config import settings


async def _signup(client: AsyncClient, username: str) -> None:
    response = await client.post(
        "/api/auth/signup",
        json={
            "email": f"{username}@jamnote.dev",
            "username": username,
            "password": "SecurePassword123!",
        },
    )
    assert response.status_code == 201
    client.cookies.set(
        settings.cookie_name, response.cookies.get(settings.cookie_name)
    )


async def _create_note(
    client: AsyncClient, title: str, folder_id: str | None = None
) -> dict:
    """Notes here test the TRASH path, so they carry real content —
    empty notes are deleted permanently by design (never trashed)."""
    payload: dict = {
        "title": title,
        "blocks": [
            {"id": "seed", "type": "text", "properties": {"text": "Real content"}, "canvas_metadata": None}
        ],
    }
    if folder_id is not None:
        payload["folder_id"] = folder_id
    response = await client.post("/api/notes", json=payload)
    assert response.status_code == 201
    return response.json()


async def _create_folder(client: AsyncClient, name: str) -> dict:
    response = await client.post("/api/folders", json={"name": name})
    assert response.status_code == 201
    return response.json()


@pytest.mark.asyncio
async def test_delete_then_trash_listing_and_restore(client: AsyncClient):
    await _signup(client, "trash_restore_user")
    note = await _create_note(client, "Shredded Draft")

    deleted = await client.delete(f"/api/notes/{note['id']}")
    assert deleted.status_code == 200
    assert deleted.json()["purged"] is False

    # Trash view lists it with deleted_at…
    trash = (await client.get("/api/notes/trash")).json()
    assert len(trash) == 1
    assert trash[0]["id"] == note["id"]
    assert trash[0]["title"] == "Shredded Draft"
    assert "deleted_at" in trash[0]

    # …while the live API pretends it doesn't exist.
    assert (await client.get(f"/api/notes/{note['id']}")).status_code == 404
    workspace = (await client.get("/api/workspace")).json()
    assert workspace["notes"] == []
    search = (await client.get("/api/notes/search", params={"q": "Shredded"})).json()
    assert search == []

    # Restore returns it intact.
    restore = await client.post(f"/api/notes/{note['id']}/restore")
    assert restore.status_code == 200
    assert restore.json()["title"] == "Shredded Draft"

    trash = (await client.get("/api/notes/trash")).json()
    assert trash == []
    workspace = (await client.get("/api/workspace")).json()
    assert workspace["notes"][0]["id"] == note["id"]


@pytest.mark.asyncio
async def test_empty_note_skips_trash_entirely(
    client: AsyncClient, mock_db: AsyncIOMotorDatabase
):
    """QOL rule: a note with nothing in it is deleted permanently on
    DELETE — it never enters the trash (nothing restorable, no
    clutter). Applies to bare notes AND all-blank blocks."""
    await _signup(client, "trash_empty_user")

    # 1. No blocks at all.
    bare = (await client.post("/api/notes", json={"title": "Bare"})).json()
    deleted = await client.delete(f"/api/notes/{bare['id']}")
    assert deleted.status_code == 200
    assert deleted.json()["purged"] is True
    assert await mock_db.notes.find_one({"_id": ObjectId(bare["id"])}) is None

    # 2. Blocks that carry no content (blank text, divider, empty image).
    blank = (
        await client.post(
            "/api/notes",
            json={
                "title": "Blank",
                "blocks": [
                    {"id": "b1", "type": "text", "properties": {"text": "   "}, "canvas_metadata": None},
                    {"id": "b2", "type": "divider", "properties": {}, "canvas_metadata": None},
                    {"id": "b3", "type": "image", "properties": {"src": None}, "canvas_metadata": None},
                ],
            },
        )
    ).json()
    deleted = await client.delete(f"/api/notes/{blank['id']}")
    assert deleted.json()["purged"] is True
    assert await mock_db.notes.find_one({"_id": ObjectId(blank["id"])}) is None

    # Neither exists anywhere: not in trash, not restorable, not listed.
    assert (await client.get("/api/notes/trash")).json() == []
    assert (await client.get(f"/api/notes/{bare['id']}")).status_code == 404
    assert (
        await client.post(f"/api/notes/{bare['id']}/restore")
    ).status_code == 404


@pytest.mark.asyncio
async def test_note_with_drawing_content_is_not_empty(client: AsyncClient):
    """Content detectors vs. the md export rule: drawings no longer
    export to markdown, but a drawing WITH data still counts as real
    content — the note goes to trash, not the shredder."""
    await _signup(client, "trash_drawing_user")
    note = (
        await client.post(
            "/api/notes",
            json={
                "title": "Doodle",
                "blocks": [
                    {
                        "id": "b1",
                        "type": "drawing",
                        "properties": {"src": "data:image/png;base64,iVBORw0KGgo="},
                        "canvas_metadata": None,
                    }
                ],
            },
        )
    ).json()

    deleted = await client.delete(f"/api/notes/{note['id']}")
    assert deleted.status_code == 200
    assert deleted.json()["purged"] is False
    assert (await client.get("/api/notes/trash")).json()[0]["id"] == note["id"]


@pytest.mark.asyncio
async def test_purge_removes_permanently(client: AsyncClient, mock_db: AsyncIOMotorDatabase):
    await _signup(client, "trash_purge_user")
    note = await _create_note(client, "Purge Me")
    await client.delete(f"/api/notes/{note['id']}")

    # Purging a LIVE note is impossible — only trash residents.
    # (The note above is now trashed, so create another live one.)
    live = await _create_note(client, "Still Alive")
    assert (
        await client.post(f"/api/notes/{live['id']}/purge")
    ).status_code == 404

    response = await client.post(f"/api/notes/{note['id']}/purge")
    assert response.status_code == 204

    stored = await mock_db.notes.find_one({"_id": ObjectId(note["id"])})
    assert stored is None
    trash = (await client.get("/api/notes/trash")).json()
    assert trash == []


@pytest.mark.asyncio
async def test_restore_after_folder_deleted_lands_at_root(client: AsyncClient):
    await _signup(client, "trash_dangling_user")
    folder = await _create_folder(client, "Gone Folder")
    note = await _create_note(client, "Orphaned Note", folder_id=folder["id"])

    await client.delete(f"/api/notes/{note['id']}")
    # Folder delete lifts contents to the parent — the trashed note
    # gets reparented too, so nothing is ever orphaned.
    assert (
        await client.delete(f"/api/folders/{folder['id']}")
    ).status_code == 204

    restore = await client.post(f"/api/notes/{note['id']}/restore")
    assert restore.status_code == 200
    # Missing folder → restored at the workspace root.
    assert restore.json()["folder_id"] is None


@pytest.mark.asyncio
async def test_trash_is_per_user(client: AsyncClient):
    await _signup(client, "trash_owner_a")
    note_a = await _create_note(client, "A's Secret")
    await client.delete(f"/api/notes/{note_a['id']}")

    await _signup(client, "trash_owner_b")
    trash_b = (await client.get("/api/notes/trash")).json()
    assert trash_b == []
    # B cannot restore or purge A's note (404, never 403).
    assert (
        await client.post(f"/api/notes/{note_a['id']}/restore")
    ).status_code == 404
    assert (
        await client.post(f"/api/notes/{note_a['id']}/purge")
    ).status_code == 404


@pytest.mark.asyncio
async def test_trashed_note_hidden_from_updates_and_exports(client: AsyncClient):
    await _signup(client, "trash_export_user")
    note = await _create_note(client, "Trashed Export Me")
    await client.delete(f"/api/notes/{note['id']}")

    # Live mutations 404 on trashed notes.
    assert (
        await client.put(f"/api/notes/{note['id']}", json={"title": "Nope"})
    ).status_code == 404
    # Exports exclude trash entirely.
    md = await client.get(f"/api/notes/{note['id']}/export", params={"format": "md"})
    assert md.status_code == 404

    zip_response = await client.get("/api/notes/export", params={"format": "zip"})
    assert zip_response.status_code == 200
    with zipfile.ZipFile(io.BytesIO(zip_response.content)) as archive:
        assert archive.namelist() == []

    json_response = await client.get("/api/notes/export", params={"format": "json"})
    assert json_response.status_code == 200
    assert json_response.json()["notes"] == []


@pytest.mark.asyncio
async def test_ttl_index_registered(mock_db: AsyncIOMotorDatabase):
    """The purge clock: the TTL index on `deleted_at` must be created
    with the 30-day expireAfterSeconds. (mongomock records the index
    spec; actual expiry is verified live with a short TTL — see
    PHASES.md Phase 7 checklist.)"""
    from fastapi_backend.database import Database

    Database.db = mock_db
    try:
        await Database.setup_indexes()
    finally:
        Database.db = None

    indexes = await mock_db.notes.index_information()
    ttl_indexes = [
        spec
        for name, spec in indexes.items()
        if spec.get("expireAfterSeconds") is not None
    ]
    assert any(
        spec["key"] == [("deleted_at", 1)] and spec["expireAfterSeconds"] == 2592000
        for spec in ttl_indexes
    ), indexes


def test_soft_delete_timestamp_is_real():
    """Sanity on the stamp shape the TTL clock reads: a BSON datetime,
    not a string — a string `deleted_at` would silently never purge."""
    from fastapi_backend.notes import service

    stamp = service.utc_now()
    assert isinstance(stamp, datetime)
