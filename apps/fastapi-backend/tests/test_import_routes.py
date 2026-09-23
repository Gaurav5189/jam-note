"""Phase 7 import tests — the validation gauntlet, roundtrips, commit
atomicity, and the rate limit (import_export_DESIGN §3/§5)."""

import json

import pytest
from bson import ObjectId
from httpx import AsyncClient
from motor.motor_asyncio import AsyncIOMotorDatabase

from fastapi_backend.config import settings
from fastapi_backend.importing import service as import_service


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


async def _create_folder(client: AsyncClient, name: str, parent: str | None = None) -> dict:
    payload: dict = {"name": name}
    if parent:
        payload["parent_folder_id"] = parent
    response = await client.post("/api/folders", json=payload)
    assert response.status_code == 201
    return response.json()


async def _create_note(
    client: AsyncClient, title: str, folder_id: str | None = None, blocks: list | None = None
) -> dict:
    payload: dict = {"title": title}
    if folder_id is not None:
        payload["folder_id"] = folder_id
    if blocks is not None:
        payload["blocks"] = blocks
    response = await client.post("/api/notes", json=payload)
    assert response.status_code == 201
    return response.json()


def _manifest(notes: list | None = None, folders: list | None = None) -> dict:
    return {
        "schema_version": 1,
        "exported_at": "2026-09-22T10:00:00Z",
        "folders": folders or [],
        "notes": notes or [],
    }


def _post(client: AsyncClient, path: str, payload) -> object:
    return client.post(path, content=json.dumps(payload))


# --- Roundtrips ----------------------------------------------------------


@pytest.mark.asyncio
async def test_single_note_json_roundtrip(client: AsyncClient):
    """Export → import → identical blocks (the §5 checklist property)."""
    await _signup(client, "roundtrip_source")
    blocks = [
        {"id": "b1", "type": "header-1", "properties": {"text": "Title Block"}, "canvas_metadata": None},
        {"id": "b2", "type": "text", "properties": {"text": "Body text."}, "canvas_metadata": None},
        {"id": "b3", "type": "todo", "properties": {"text": "Check me", "checked": True}, "canvas_metadata": None},
        {"id": "b4", "type": "code", "properties": {"text": "x = 1", "language": "python"}, "canvas_metadata": None},
        {
            "id": "b5",
            "type": "drawing",
            "properties": {"src": "data:image/png;base64,iVBORw0KGgo="},
            "canvas_metadata": None,
        },
        {
            "id": "b6",
            "type": "text",
            "properties": {"text": "Node"},
            "canvas_metadata": {"x": 10.0, "y": 20.0, "width": 100.0, "height": 50.0, "color": None},
        },
    ]
    note = await _create_note(client, "Roundtrip Note", blocks=blocks)

    # The API normalizes blocks on write (full property shape); the
    # roundtrip property is export == the SOURCE's stored blocks.
    source_full = (await client.get(f"/api/notes/{note['id']}")).json()

    export = (
        await client.get(f"/api/notes/{note['id']}/export", params={"format": "json"})
    ).json()

    # Restore into a fresh user's empty workspace.
    await _signup(client, "roundtrip_target")
    commit = await _post(client, "/api/import/commit", export)
    assert commit.status_code == 200
    assert commit.json()["notes"] == 1

    workspace = (await client.get("/api/workspace")).json()
    assert len(workspace["notes"]) == 1
    restored = workspace["notes"][0]
    assert restored["title"] == "Roundtrip Note"
    assert restored["folder_id"] is None

    full = (await client.get(f"/api/notes/{restored['id']}")).json()
    assert full["blocks"] == source_full["blocks"]
    assert full["layout_type"] == source_full["layout_type"]


@pytest.mark.asyncio
async def test_workspace_backup_restores_tree_and_content(client: AsyncClient):
    await _signup(client, "backup_source")
    folder = await _create_folder(client, "Racks", )
    nested = await _create_folder(client, "Modules", parent=folder["id"])
    await _create_note(client, "Loose Note")
    await _create_note(client, "Rack Note", folder_id=folder["id"], blocks=[
        {"id": "r1", "type": "text", "properties": {"text": "Content"}, "canvas_metadata": None},
    ])
    await _create_note(client, "Nested Note", folder_id=nested["id"])

    backup = (
        await client.get("/api/notes/export", params={"format": "json"})
    ).json()

    await _signup(client, "backup_target")
    commit = await _post(client, "/api/import/commit", backup)
    assert commit.status_code == 200
    assert commit.json() == {"folders": 2, "notes": 3, "message": "Imported 3 notes, 2 folders"}

    workspace = (await client.get("/api/workspace")).json()
    folder_names = [f["name"] for f in workspace["folders"]]
    assert folder_names == ["Racks"]
    assert [n["title"] for n in workspace["notes"]] == ["Loose Note"]
    inner = workspace["folders"][0]
    assert [n["title"] for n in inner["notes"]] == ["Rack Note"]
    assert [f["name"] for f in inner["folders"]] == ["Modules"]
    assert [n["title"] for n in inner["folders"][0]["notes"]] == ["Nested Note"]

    rack_note = inner["notes"][0]
    full = (await client.get(f"/api/notes/{rack_note['id']}")).json()
    assert full["blocks"][0]["properties"]["text"] == "Content"


@pytest.mark.asyncio
async def test_import_discards_ids_and_remaps_ownership(client: AsyncClient, mock_db: AsyncIOMotorDatabase):
    """Incoming `_id`/`user_id`/`folder_id` are ignored — fresh ids,
    importer owns everything (§5: 'Imported IDs never collide with or
    reference another user's data')."""
    await _signup(client, "id_remap_user")

    malicious = _manifest(
        notes=[
            {
                "title": "Forged Note",
                "path": [],
                "_id": "65f000000000000000000000",
                "user_id": "65f0000000000000000000ff",
                "folder_id": "65f0000000000000000000aa",
                "blocks": [],
            }
        ],
    )
    commit = await _post(client, "/api/import/commit", malicious)
    assert commit.status_code == 200

    workspace = (await client.get("/api/workspace")).json()
    assert len(workspace["notes"]) == 1
    note_id = workspace["notes"][0]["id"]
    assert note_id != "65f000000000000000000000"
    stored = await mock_db.notes.find_one({"_id": ObjectId(note_id)})
    assert stored["user_id"] != ObjectId("65f0000000000000000000ff")
    assert stored["folder_id"] is None


@pytest.mark.asyncio
async def test_import_strips_unknown_fields_and_regenerates_bad_ids(client: AsyncClient):
    await _signup(client, "sanitize_user")

    manifest = _manifest(
        notes=[
            {
                "title": "Unknown Fields",
                "path": [],
                "mystery_flag": True,  # unknown note field — stripped
                "blocks": [
                    {
                        "id": "dup",
                        "type": "text",
                        "properties": {"text": "one", "evil_key": "x"},
                        "canvas_metadata": None,
                        "surprise": "y",
                    },
                    # duplicate id → all ids regenerate, connections remap
                    {
                        "id": "dup",
                        "type": "text",
                        "properties": {"text": "two"},
                        "canvas_metadata": None,
                    },
                    # missing id → covered by the regeneration too
                    {"type": "divider", "properties": {}, "canvas_metadata": None},
                ],
                "block_connections": [
                    {"from_id": "dup", "to_id": "dup", "color": None},  # self → dropped
                    {"from_id": "dup", "to_id": "ghost", "color": None},  # dangling → dropped
                ],
            }
        ],
    )
    commit = await _post(client, "/api/import/commit", manifest)
    assert commit.status_code == 200

    workspace = (await client.get("/api/workspace")).json()
    full = (
        await client.get(f"/api/notes/{workspace['notes'][0]['id']}")
    ).json()
    assert len(full["blocks"]) == 3
    ids = [b["id"] for b in full["blocks"]]
    assert len(set(ids)) == 3  # duplicates regenerated
    for block in full["blocks"]:
        assert set(block.keys()) == {"id", "type", "properties", "canvas_metadata"}
        assert set(block["properties"].keys()) == {"text", "language", "checked", "src"}
    assert full["block_connections"] == []


# --- Rejections (each with its specific message) -------------------------


@pytest.mark.asyncio
async def test_reject_wrong_schema_version(client: AsyncClient):
    await _signup(client, "schema_version_user")
    response = await _post(
        client, "/api/import/preview", _manifest(notes=[], folders=[],
        ) | {"schema_version": 99},
    )
    assert response.status_code == 400
    assert "Unsupported schema version" in response.json()["detail"]


@pytest.mark.asyncio
async def test_reject_nan_and_infinity(client: AsyncClient):
    await _signup(client, "nan_user")
    raw = '{"schema_version": 1, "folders": [], "notes": [{"title": "x", "blocks": [{"type": "text", "properties": {"text": NaN}}]}]}'
    response = await client.post("/api/import/preview", content=raw)
    assert response.status_code == 400
    assert "Invalid JSON" in response.json()["detail"]


@pytest.mark.asyncio
async def test_reject_deep_nesting(client: AsyncClient):
    await _signup(client, "depth_user")
    nested: dict = {"leaf": 1}
    for _ in range(60):
        nested = {"child": nested}
    response = await _post(
        client, "/api/import/preview", {"schema_version": 1, "deep": nested}
    )
    assert response.status_code == 400
    assert "Too deeply nested" in response.json()["detail"]


@pytest.mark.asyncio
async def test_reject_oversized_body(client: AsyncClient):
    await _signup(client, "size_user")
    payload = _manifest() | {"padding": "x" * (10 * 1024 * 1024 + 1)}
    response = await _post(client, "/api/import/preview", payload)
    assert response.status_code == 400
    assert "Too large" in response.json()["detail"]


@pytest.mark.asyncio
async def test_reject_unknown_block_type(client: AsyncClient):
    await _signup(client, "block_type_user")
    manifest = _manifest(
        notes=[
            {
                "title": "Bad Type",
                "path": [],
                "blocks": [{"type": "script-tag", "properties": {}, "canvas_metadata": None}],
            }
        ]
    )
    response = await _post(client, "/api/import/preview", manifest)
    assert response.status_code == 400
    assert "Unsupported block type" in response.json()["detail"]


@pytest.mark.asyncio
async def test_reject_oversized_text_and_blocks(client: AsyncClient):
    await _signup(client, "caps_user")
    big_text = _manifest(
        notes=[
            {
                "title": "Too Long",
                "path": [],
                "blocks": [{"type": "text", "properties": {"text": "y" * 50_001}, "canvas_metadata": None}],
            }
        ]
    )
    response = await _post(client, "/api/import/preview", big_text)
    assert response.status_code == 400

    many_blocks = _manifest(
        notes=[
            {
                "title": "Too Many Blocks",
                "path": [],
                "blocks": [
                    {"type": "text", "properties": {"text": "b"}, "canvas_metadata": None}
                    for _ in range(2_001)
                ],
            }
        ]
    )
    response = await _post(client, "/api/import/preview", many_blocks)
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_reject_hostile_src_schemes(client: AsyncClient):
    await _signup(client, "src_user")
    for src in ("javascript:alert(1)", "data:text/html;base64,PHNjcmlwdD4=", "http://insecure.example/x.png"):
        manifest = _manifest(
            notes=[
                {
                    "title": "Hostile",
                    "path": [],
                    "blocks": [{"type": "image", "properties": {"src": src}, "canvas_metadata": None}],
                }
            ]
        )
        response = await _post(client, "/api/import/preview", manifest)
        assert response.status_code == 400, src
        assert "unsupported src" in response.json()["detail"]


@pytest.mark.asyncio
async def test_reject_undeclared_folder_parent(client: AsyncClient):
    await _signup(client, "dangling_folder_user")
    manifest = _manifest(
        folders=[{"name": "Orphan", "path": ["Never Declared"]}],
    )
    response = await _post(client, "/api/import/preview", manifest)
    assert response.status_code == 400
    assert "undeclared parent" in response.json()["detail"]


# --- Preview / commit semantics ------------------------------------------


@pytest.mark.asyncio
async def test_preview_commits_nothing(client: AsyncClient, mock_db: AsyncIOMotorDatabase):
    await _signup(client, "preview_user")
    manifest = _manifest(
        folders=[{"name": "Previewed", "path": []}],
        notes=[{"title": "Previewed Note", "path": ["Previewed"], "blocks": []}],
    )

    response = await _post(client, "/api/import/preview", manifest)
    assert response.status_code == 200
    data = response.json()
    assert data["folders"] == 1
    assert data["notes"] == 1
    assert data["size_bytes"] > 0

    stored_notes = await mock_db.notes.count_documents({})
    stored_folders = await mock_db.folders.count_documents({})
    assert stored_notes == 0
    assert stored_folders == 0


@pytest.mark.asyncio
async def test_injected_mid_import_failure_commits_nothing(client: AsyncClient, mock_db: AsyncIOMotorDatabase, monkeypatch):
    """The fallback path's compensating delete: a mid-import failure
    leaves zero notes and zero folders behind (§5 atomicity)."""
    await _signup(client, "atomic_user")

    original = import_service._prepare_note_payload

    def exploding(note):
        if note.title == "Trigger":
            raise RuntimeError("injected mid-import failure")
        return original(note)

    monkeypatch.setattr(import_service, "_prepare_note_payload", exploding)

    manifest = _manifest(
        folders=[{"name": "Victim", "path": []}],
        notes=[
            {"title": "First", "path": ["Victim"], "blocks": []},
            {"title": "Trigger", "path": ["Victim"], "blocks": []},
        ],
    )
    response = await _post(client, "/api/import/commit", manifest)
    assert response.status_code == 500
    assert "nothing was committed" in response.json()["detail"]

    stored_notes = await mock_db.notes.count_documents({})
    stored_folders = await mock_db.folders.count_documents({})
    assert stored_notes == 0
    assert stored_folders == 0

    monkeypatch.undo()
    # The workspace is clean — a retry with the fixed payload succeeds.
    response = await _post(client, "/api/import/commit", manifest)
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_commit_revalidates_a_tampered_preview(client: AsyncClient):
    await _signup(client, "revalidate_user")
    good = _manifest(notes=[{"title": "Fine", "path": [], "blocks": []}])
    assert (await _post(client, "/api/import/preview", good)).status_code == 200

    bad = _manifest(notes=[{"title": "Nope", "path": [], "blocks": [{"type": "script-tag", "properties": {}}]}])
    response = await _post(client, "/api/import/commit", bad)
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_import_rate_limited_after_five_commits(client: AsyncClient):
    import_service._recent_imports.clear()
    await _signup(client, "rate_limit_user")
    manifest = _manifest(notes=[{"title": "Spam", "path": [], "blocks": []}])

    for index in range(import_service.IMPORT_RATE_LIMIT):
        response = await _post(client, "/api/import/commit", manifest)
        assert response.status_code == 200, index

    sixth = await _post(client, "/api/import/commit", manifest)
    assert sixth.status_code == 429
    assert "Import limit" in sixth.json()["detail"]

    # Preview is not rate limited (cheap, commits nothing).
    assert (await _post(client, "/api/import/preview", manifest)).status_code == 200


# --- Idempotent commit (lost-response retries never duplicate) ------------


@pytest.mark.asyncio
async def test_commit_replays_for_the_same_token(client: AsyncClient, mock_db: AsyncIOMotorDatabase):
    """Slow-network scenario: the commit landed but the client never saw
    the response, so it retries with the SAME token — the stored receipt
    replays and the notes are NOT imported twice."""
    import_service._recent_imports.clear()
    await _signup(client, "idem_replay_user")
    manifest = _manifest(notes=[{"title": "Once Only", "path": [], "blocks": []}])

    first = await _post(
        client, "/api/import/commit?import_token=fixed-token-1", manifest
    )
    assert first.status_code == 200
    assert first.json()["notes"] == 1

    # The "lost response" retry — same token.
    retry = await _post(
        client, "/api/import/commit?import_token=fixed-token-1", manifest
    )
    assert retry.status_code == 200
    assert retry.json() == first.json()

    stored = await mock_db.notes.count_documents({})
    assert stored == 1

    # A DIFFERENT token is a deliberate fresh import — it duplicates.
    again = await _post(
        client, "/api/import/commit?import_token=fixed-token-2", manifest
    )
    assert again.status_code == 200
    assert await mock_db.notes.count_documents({}) == 2

    # Replays never consume the rate limit: five replays of the first
    # token must all succeed alongside the two fresh imports above.
    for _ in range(5):
        assert (
            await _post(client, "/api/import/commit?import_token=fixed-token-1", manifest)
        ).status_code == 200
    assert await mock_db.notes.count_documents({}) == 2


@pytest.mark.asyncio
async def test_replayed_commit_refreshes_sidebar_not_dupes(
    client: AsyncClient, mock_db: AsyncIOMotorDatabase
):
    """End-to-end shape of the bug report: import, response lost,
    sidebar not refreshed, retry — the workspace lists each note ONCE."""
    await _signup(client, "idem_sidebar_user")
    manifest = _manifest(notes=[{"title": "Solo", "path": [], "blocks": []}])

    await _post(client, "/api/import/commit?import_token=abc123", manifest)
    await _post(client, "/api/import/commit?import_token=abc123", manifest)
    await _post(client, "/api/import/commit?import_token=abc123", manifest)

    workspace = (await client.get("/api/workspace")).json()
    assert len(workspace["notes"]) == 1


@pytest.mark.asyncio
async def test_failed_import_writes_no_receipt_so_retry_is_clean(
    client: AsyncClient, mock_db: AsyncIOMotorDatabase
):
    """A genuinely failed commit leaves no receipt — the retry with the
    same token re-executes instead of replaying a phantom success."""
    import_service._recent_imports.clear()
    await _signup(client, "idem_failure_user")
    manifest = _manifest(notes=[{"title": "Retry Me", "path": [], "blocks": []}])

    ok = await _post(client, "/api/import/commit?import_token=ok-token", manifest)
    assert ok.status_code == 200

    # Import with an invalid folder path fails validation — no receipt
    # may exist for its token, so a later retry actually re-runs.
    bad = _manifest(
        folders=[{"name": "X", "path": [""], "created_at": None, "updated_at": None, "color": None}]
    )
    failed = await _post(client, "/api/import/commit?import_token=bad-token", bad)
    assert failed.status_code == 400
    assert await mock_db.import_receipts.count_documents({"token": "bad-token"}) == 0
