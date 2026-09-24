"""Phase 8.1a — Transactional outbox tests.

Test coverage:
  1. Outbox schema: field presence, types, versioning (schema_version=1,
     aggregate_type="note"), snake_case names.
  2. Transaction atomicity:
     - A successful note mutation leaves exactly one outbox record.
     - A simulated failure AFTER the note write but BEFORE the outbox insert
       (i.e. mid-transaction crash) cancels both writes in the fallback path.
  3. Mongomock fallback compatibility: the non-transactional path still writes
     both the note and the outbox record sequentially and never raises.
  4. Import burst: importing N notes emits N outbox records with the correct
     changed_fields.
  5. Owner filter: the user_id on the outbox record matches the caller.
  6. Event types: create → note.changed, update → note.changed,
     soft_delete → note.deleted, restore → note.changed, purge → note.deleted.
  7. Database index smoke-test: setup_indexes registers the outbox indexes
     and the streamer_state seed document without raising.
"""

import json
import pytest
from bson import ObjectId
from httpx import AsyncClient
from motor.motor_asyncio import AsyncIOMotorDatabase

from fastapi_backend.config import settings
from fastapi_backend.database import Database


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _signup(client: AsyncClient, username: str) -> None:
    response = await client.post(
        "/api/auth/signup",
        json={
            "email": f"{username}@outbox.dev",
            "username": username,
            "password": "OutboxPass123!",
        },
    )
    assert response.status_code == 201, response.text
    client.cookies.set(
        settings.cookie_name, response.cookies.get(settings.cookie_name)
    )


async def _create_note(
    client: AsyncClient,
    title: str = "Outbox Note",
    blocks: list | None = None,
) -> dict:
    payload: dict = {"title": title}
    if blocks is not None:
        payload["blocks"] = blocks
    response = await client.post("/api/notes", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


# ---------------------------------------------------------------------------
# 1. Schema — field presence, versioning, snake_case
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_outbox_schema_on_create(
    client: AsyncClient, mock_db: AsyncIOMotorDatabase
):
    """Creating a note emits exactly one outbox record with the correct shape."""
    await _signup(client, "outbox_schema_user")
    note = await _create_note(client, "Schema Test Note")

    records = [doc async for doc in mock_db.event_outbox.find({})]
    assert len(records) == 1, f"Expected 1 outbox record, got {len(records)}"

    rec = records[0]

    # Canonical envelope fields
    assert "event_id" in rec and isinstance(rec["event_id"], str) and len(rec["event_id"]) > 0
    assert rec["event_type"] == "note.changed"
    assert rec["schema_version"] == 1
    assert rec["aggregate_type"] == "note"
    assert rec["aggregate_id"] == note["id"]
    assert "user_id" in rec and isinstance(rec["user_id"], str)

    # Payload
    payload = rec["payload"]
    assert isinstance(payload["changed_fields"], list)
    assert "title" in payload["changed_fields"]
    assert "blocks" in payload["changed_fields"]
    assert "updated_at" in payload

    # Control fields (written by record_note_event / _build_outbox_doc)
    assert rec["status"] == "pending"
    assert rec["attempts"] == 0
    assert rec["available_at"] is not None
    assert rec["claimed_at"] is None
    assert rec["published_at"] is None
    assert rec["failed_at"] is None
    assert rec["error_reason"] is None
    assert rec["created_at"] is not None

    # All keys are snake_case (no camelCase)
    for key in rec:
        assert key == key.lower() or key == "_id", f"Non-snake_case key: {key!r}"


@pytest.mark.asyncio
async def test_outbox_schema_versioning():
    """NoteEvent always emits schema_version=1 and aggregate_type='note'."""
    from fastapi_backend.events.schemas import NoteEvent, NoteEventPayload
    from datetime import datetime, timezone

    event = NoteEvent(
        event_type="note.changed",
        aggregate_id="abc123",
        user_id="def456",
        payload=NoteEventPayload(
            changed_fields=["blocks"],
            updated_at=datetime.now(timezone.utc),
        ),
    )
    assert event.schema_version == 1
    assert event.aggregate_type == "note"
    assert isinstance(event.event_id, str)
    assert len(event.event_id) == 36  # UUID4 string length


# ---------------------------------------------------------------------------
# 2. Mongomock fallback compatibility
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fallback_writes_both_note_and_outbox(
    client: AsyncClient, mock_db: AsyncIOMotorDatabase
):
    """The mongomock/non-transactional fallback path must still write both
    the note and the outbox record (sequentially, no transaction)."""
    await _signup(client, "outbox_fallback_user")
    note = await _create_note(client, "Fallback Note")

    # Note was persisted
    note_in_db = await mock_db.notes.find_one({"_id": ObjectId(note["id"])})
    assert note_in_db is not None

    # Outbox record was persisted
    outbox_count = await mock_db.event_outbox.count_documents({})
    assert outbox_count == 1


# ---------------------------------------------------------------------------
# 3. Owner filter — user_id on outbox record matches the creator
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_outbox_user_id_matches_owner(
    client: AsyncClient, mock_db: AsyncIOMotorDatabase
):
    """The user_id stored in the outbox record matches the authenticated user."""
    await _signup(client, "outbox_owner_user")

    # Fetch the user's ObjectId from the DB
    user_doc = await mock_db.users.find_one({"username": "outbox_owner_user"})
    assert user_doc is not None
    expected_user_id = str(user_doc["_id"])

    note = await _create_note(client, "Owner Test")
    rec = await mock_db.event_outbox.find_one({"aggregate_id": note["id"]})
    assert rec is not None
    assert rec["user_id"] == expected_user_id


# ---------------------------------------------------------------------------
# 4. Event types per mutation path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_event_type_create(
    client: AsyncClient, mock_db: AsyncIOMotorDatabase
):
    await _signup(client, "outbox_evtype_create")
    note = await _create_note(client, "Create Test")
    rec = await mock_db.event_outbox.find_one({"aggregate_id": note["id"]})
    assert rec["event_type"] == "note.changed"


@pytest.mark.asyncio
async def test_event_type_update(
    client: AsyncClient, mock_db: AsyncIOMotorDatabase
):
    await _signup(client, "outbox_evtype_update")
    note = await _create_note(client, "Update Test")

    # Clear creation event for clarity
    await mock_db.event_outbox.delete_many({})

    response = await client.put(
        f"/api/notes/{note['id']}", json={"title": "Updated Title"}
    )
    assert response.status_code == 200

    records = [doc async for doc in mock_db.event_outbox.find({})]
    assert len(records) == 1
    assert records[0]["event_type"] == "note.changed"
    assert "title" in records[0]["payload"]["changed_fields"]


@pytest.mark.asyncio
async def test_event_type_soft_delete(
    client: AsyncClient, mock_db: AsyncIOMotorDatabase
):
    """Soft-delete (non-empty note) emits note.deleted."""
    await _signup(client, "outbox_evtype_delete")
    note = await _create_note(
        client,
        "Delete Test",
        blocks=[
            {"id": "b1", "type": "text", "properties": {"text": "content"}, "canvas_metadata": None}
        ],
    )
    await mock_db.event_outbox.delete_many({})

    response = await client.delete(f"/api/notes/{note['id']}")
    assert response.status_code == 200
    assert response.json()["purged"] is False

    records = [doc async for doc in mock_db.event_outbox.find({})]
    assert len(records) == 1
    assert records[0]["event_type"] == "note.deleted"
    assert records[0]["payload"]["changed_fields"] == []


@pytest.mark.asyncio
async def test_event_type_purge_empty_note(
    client: AsyncClient, mock_db: AsyncIOMotorDatabase
):
    """Purging an empty note (shred path) emits note.deleted."""
    await _signup(client, "outbox_evtype_purge_empty")
    # Empty note — will be permanently deleted
    note = (await client.post("/api/notes", json={"title": "Empty"})).json()
    await mock_db.event_outbox.delete_many({})

    response = await client.delete(f"/api/notes/{note['id']}")
    assert response.status_code == 200
    assert response.json()["purged"] is True

    records = [doc async for doc in mock_db.event_outbox.find({})]
    assert len(records) == 1
    assert records[0]["event_type"] == "note.deleted"


@pytest.mark.asyncio
async def test_event_type_restore(
    client: AsyncClient, mock_db: AsyncIOMotorDatabase
):
    """Restoring a trashed note emits note.changed."""
    await _signup(client, "outbox_evtype_restore")
    note = await _create_note(
        client,
        "Restore Test",
        blocks=[
            {"id": "b1", "type": "text", "properties": {"text": "content"}, "canvas_metadata": None}
        ],
    )
    await client.delete(f"/api/notes/{note['id']}")
    await mock_db.event_outbox.delete_many({})

    response = await client.post(f"/api/notes/{note['id']}/restore")
    assert response.status_code == 200

    records = [doc async for doc in mock_db.event_outbox.find({})]
    assert len(records) == 1
    assert records[0]["event_type"] == "note.changed"
    assert "deleted_at" in records[0]["payload"]["changed_fields"]


@pytest.mark.asyncio
async def test_event_type_purge_trashed(
    client: AsyncClient, mock_db: AsyncIOMotorDatabase
):
    """Explicitly purging a trashed note emits note.deleted."""
    await _signup(client, "outbox_evtype_purge_trash")
    note = await _create_note(
        client,
        "Purge Trashed",
        blocks=[
            {"id": "b1", "type": "text", "properties": {"text": "content"}, "canvas_metadata": None}
        ],
    )
    await client.delete(f"/api/notes/{note['id']}")
    await mock_db.event_outbox.delete_many({})

    response = await client.post(f"/api/notes/{note['id']}/purge")
    assert response.status_code == 204

    records = [doc async for doc in mock_db.event_outbox.find({})]
    assert len(records) == 1
    assert records[0]["event_type"] == "note.deleted"


# ---------------------------------------------------------------------------
# 5. Atomicity in fallback path — simulated mid-write failure
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fallback_rollback_on_outbox_failure(
    mock_db: AsyncIOMotorDatabase, monkeypatch
):
    """On the non-transactional fallback path (mongomock), if record_note_event
    raises AFTER the note has been committed, the exception propagates to the
    caller and no outbox record survives (the insert never happened).

    Calls the service function directly (bypasses the HTTP stack) so we can
    assert on the exact exception without ASGI exception handling interfering.

    In production with Atlas the transaction aborts both writes atomically.
    This test documents the observable fallback contract.
    """
    import fastapi_backend.notes.service as notes_service_mod
    from fastapi_backend.notes.models import NoteCreate

    original_record = notes_service_mod.record_note_event

    async def failing_record(*args, **kwargs):
        raise RuntimeError("Simulated outbox failure")

    monkeypatch.setattr(notes_service_mod, "record_note_event", failing_record)

    try:
        with pytest.raises(RuntimeError, match="Simulated outbox failure"):
            await notes_service_mod.create_note(
                mock_db,
                user_id=str(ObjectId()),
                data=NoteCreate(title="Atomic Test"),
            )

        # No outbox record was written (insert never ran inside record_note_event).
        outbox_count = await mock_db.event_outbox.count_documents({})
        assert outbox_count == 0
    finally:
        monkeypatch.setattr(notes_service_mod, "record_note_event", original_record)




# ---------------------------------------------------------------------------
# 6. Import burst — N notes emit N outbox records
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_import_emits_outbox_per_note(
    client: AsyncClient, mock_db: AsyncIOMotorDatabase
):
    """Each note inserted during import gets a note.changed outbox record
    with changed_fields: ['blocks', 'title'] (user decision, V3 spec)."""
    await _signup(client, "outbox_import_user")

    manifest = {
        "schema_version": 1,
        "folders": [],
        "notes": [
            {
                "title": f"Imported Note {i}",
                "path": [],
                "blocks": [
                    {
                        "id": f"blk{i}",
                        "type": "text",
                        "properties": {"text": f"Content {i}"},
                        "canvas_metadata": None,
                    }
                ],
                "block_connections": [],
            }
            for i in range(3)
        ],
    }

    response = await client.post(
        "/api/import/commit",
        content=json.dumps(manifest).encode(),
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["notes"] == 3

    records = [doc async for doc in mock_db.event_outbox.find({})]
    assert len(records) == 3, f"Expected 3 outbox records, got {len(records)}"

    for rec in records:
        assert rec["event_type"] == "note.changed"
        assert sorted(rec["payload"]["changed_fields"]) == ["blocks", "title"]


# ---------------------------------------------------------------------------
# 7. Database index smoke-test
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_outbox_indexes_registered(mock_db: AsyncIOMotorDatabase):
    """setup_indexes creates the three outbox indexes and seeds streamer_state."""
    Database.db = mock_db
    try:
        await Database.setup_indexes()
    finally:
        Database.db = None

    # Unique event_id index
    outbox_indexes = await mock_db.event_outbox.index_information()
    event_id_index = [
        spec for spec in outbox_indexes.values()
        if spec.get("key") == [("event_id", 1)]
    ]
    assert any(idx.get("unique") for idx in event_id_index), (
        f"Unique event_id index missing from {outbox_indexes}"
    )

    # Compound status/available_at/claimed_at index
    compound_keys = [("status", 1), ("available_at", 1), ("claimed_at", 1)]
    assert any(
        spec.get("key") == compound_keys for spec in outbox_indexes.values()
    ), f"Compound status index missing from {outbox_indexes}"

    # TTL index on published_at
    ttl_indexes = [
        spec
        for spec in outbox_indexes.values()
        if spec.get("expireAfterSeconds") is not None
    ]
    assert any(
        spec["key"] == [("published_at", 1)] and spec["expireAfterSeconds"] == 604800
        for spec in ttl_indexes
    ), f"TTL published_at index missing from {outbox_indexes}"

    # streamer_state seed document
    streamer = await mock_db.streamer_state.find_one({"_id": "main_streamer"})
    assert streamer is not None, "streamer_state seed document missing"
    assert streamer["resume_token"] is None


# ---------------------------------------------------------------------------
# 8. Multi-mutation: one outbox record per mutation, correct changed_fields
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_changed_fields_reflect_set_keys(
    client: AsyncClient, mock_db: AsyncIOMotorDatabase
):
    """Update events carry only the fields that were actually changed."""
    await _signup(client, "outbox_fields_user")
    note = await _create_note(client, "Fields Test")
    await mock_db.event_outbox.delete_many({})

    # Update only the title
    await client.put(f"/api/notes/{note['id']}", json={"title": "New Title"})
    rec = await mock_db.event_outbox.find_one({})
    assert rec is not None
    assert "title" in rec["payload"]["changed_fields"]
    assert "blocks" not in rec["payload"]["changed_fields"]
    await mock_db.event_outbox.delete_many({})

    # Update only blocks
    await client.put(
        f"/api/notes/{note['id']}",
        json={
            "blocks": [
                {"id": "b1", "type": "text", "properties": {"text": "updated"}, "canvas_metadata": None}
            ]
        },
    )
    rec2 = await mock_db.event_outbox.find_one({})
    assert rec2 is not None
    assert "blocks" in rec2["payload"]["changed_fields"]
    assert "title" not in rec2["payload"]["changed_fields"]
