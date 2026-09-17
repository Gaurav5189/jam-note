import pytest
from bson import ObjectId
from httpx import AsyncClient
from motor.motor_asyncio import AsyncIOMotorDatabase

from fastapi_backend.config import settings


async def signup_and_authenticate(client: AsyncClient, username: str) -> None:
    """Create a user and attach the session cookie to the client."""
    response = await client.post(
        "/api/auth/signup",
        json={
            "email": f"{username}@jamnote.dev",
            "username": username,
            "password": "SecurePassword123!",
        },
    )
    assert response.status_code == 201
    cookie_value = response.cookies.get(settings.cookie_name)
    assert cookie_value
    client.cookies.set(settings.cookie_name, cookie_value)


async def create_note(client: AsyncClient, title: str, parent_id: str | None = None) -> dict:
    payload: dict = {"title": title}
    if parent_id is not None:
        payload["parent_id"] = parent_id
    response = await client.post("/api/notes", json=payload)
    assert response.status_code == 201
    return response.json()


# --- Create ---


@pytest.mark.asyncio
async def test_create_note_success(client: AsyncClient, mock_db: AsyncIOMotorDatabase):
    await signup_and_authenticate(client, "note_creator")

    note = await create_note(client, "Synth Patches")

    assert note["title"] == "Synth Patches"
    assert note["parent_id"] is None
    assert note["layout_type"] == "document"
    assert note["blocks"] == []
    assert note["is_published"] is False
    assert "id" in note

    stored = await mock_db.notes.find_one({"_id": ObjectId(note["id"])})
    assert stored is not None
    assert stored["title"] == "Synth Patches"
    assert stored["is_published"] is False


@pytest.mark.asyncio
async def test_create_note_with_blocks(client: AsyncClient):
    await signup_and_authenticate(client, "block_creator")

    payload = {
        "title": "Patch Sheet",
        "blocks": [
            {
                "id": "block-uuid-1",
                "type": "text",
                "properties": {"text": "Hello world"},
            },
            {
                "id": "block-uuid-2",
                "type": "todo",
                "properties": {"text": "Ship Phase 2", "checked": True},
            },
        ],
    }
    response = await client.post("/api/notes", json=payload)
    assert response.status_code == 201

    note = response.json()
    assert len(note["blocks"]) == 2
    assert note["blocks"][0]["properties"]["text"] == "Hello world"
    assert note["blocks"][1]["properties"]["checked"] is True


@pytest.mark.asyncio
async def test_create_nested_note(client: AsyncClient, mock_db: AsyncIOMotorDatabase):
    await signup_and_authenticate(client, "nested_creator")

    parent = await create_note(client, "Parent Note")
    child = await create_note(client, "Child Note", parent_id=parent["id"])

    assert child["parent_id"] == parent["id"]

    stored_child = await mock_db.notes.find_one({"_id": ObjectId(child["id"])})
    assert stored_child["parent_id"] == ObjectId(parent["id"])


@pytest.mark.asyncio
async def test_create_note_parent_not_found(client: AsyncClient):
    await signup_and_authenticate(client, "orphan_parent_user")

    ghost_id = str(ObjectId())
    response = await client.post("/api/notes", json={"title": "Note", "parent_id": ghost_id})
    assert response.status_code == 404
    assert "Parent note not found" in response.json()["detail"]


@pytest.mark.asyncio
async def test_create_note_malformed_parent_id(client: AsyncClient):
    await signup_and_authenticate(client, "malformed_parent_user")

    response = await client.post("/api/notes", json={"title": "Note", "parent_id": "not-an-objectid"})
    assert response.status_code == 400
    assert "Invalid parent_id" in response.json()["detail"]


@pytest.mark.asyncio
async def test_create_note_with_foreign_parent_is_rejected(client: AsyncClient):
    await signup_and_authenticate(client, "owner_a")
    foreign_parent = await create_note(client, "A's Private Note")
    client.cookies.clear()

    await signup_and_authenticate(client, "intruder_b")
    response = await client.post(
        "/api/notes", json={"title": "Stolen Child", "parent_id": foreign_parent["id"]}
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_create_note_validation_errors(client: AsyncClient):
    await signup_and_authenticate(client, "validation_user")

    # Title too short (empty after strip)
    res = await client.post("/api/notes", json={"title": "   "})
    assert res.status_code == 422

    # Title too long
    res = await client.post("/api/notes", json={"title": "x" * 201})
    assert res.status_code == 422

    # Invalid layout type
    res = await client.post("/api/notes", json={"title": "Valid", "layout_type": "hologram"})
    assert res.status_code == 422


# --- List ---


@pytest.mark.asyncio
async def test_list_notes_returns_only_owned_notes(client: AsyncClient):
    await signup_and_authenticate(client, "owner_list")
    await create_note(client, "My First Note")
    await create_note(client, "My Second Note")
    client.cookies.clear()

    await signup_and_authenticate(client, "other_user_list")
    await create_note(client, "Their Note")

    response = await client.get("/api/notes")
    assert response.status_code == 200
    notes = response.json()
    assert len(notes) == 1
    assert notes[0]["title"] == "Their Note"
    # Block payloads must not leak into list reads
    assert "blocks" not in notes[0]


# --- Trees ---


@pytest.mark.asyncio
async def test_note_trees_endpoint_returns_hierarchy(client: AsyncClient):
    await signup_and_authenticate(client, "tree_user")

    root_a = await create_note(client, "Root A")
    root_b = await create_note(client, "Root B")
    child_a1 = await create_note(client, "Child A1", parent_id=root_a["id"])
    await create_note(client, "Grandchild A1", parent_id=child_a1["id"])

    response = await client.get("/api/notes/trees")
    assert response.status_code == 200
    tree = response.json()

    root_titles = [item["title"] for item in tree]
    assert root_titles == ["Root A", "Root B"]

    root_a_item = next(item for item in tree if item["title"] == "Root A")
    assert len(root_a_item["children"]) == 1
    assert root_a_item["children"][0]["title"] == "Child A1"
    assert root_a_item["children"][0]["children"][0]["title"] == "Grandchild A1"


# --- Search ---


@pytest.mark.asyncio
async def test_search_notes_case_insensitive(client: AsyncClient):
    await signup_and_authenticate(client, "search_user")
    await create_note(client, "Synth Patches")
    await create_note(client, "Drum Kit Tuning")

    response = await client.get("/api/notes/search", params={"q": "SYNTH"})
    assert response.status_code == 200
    results = response.json()
    assert len(results) == 1
    assert results[0]["title"] == "Synth Patches"


@pytest.mark.asyncio
async def test_search_notes_no_results(client: AsyncClient):
    await signup_and_authenticate(client, "empty_search_user")
    await create_note(client, "Unrelated Title")

    response = await client.get("/api/notes/search", params={"q": "quantum"})
    assert response.status_code == 200
    assert response.json() == []


@pytest.mark.asyncio
async def test_search_notes_isolated_by_user(client: AsyncClient):
    await signup_and_authenticate(client, "search_owner_a")
    await create_note(client, "Shared Title")
    client.cookies.clear()

    await signup_and_authenticate(client, "search_owner_b")
    await create_note(client, "Shared Title")
    await create_note(client, "Private Title")

    response = await client.get("/api/notes/search", params={"q": "Shared"})
    assert response.status_code == 200
    results = response.json()
    # User B sees only their own "Shared Title" — never A's copy.
    assert len(results) == 1
    assert results[0]["title"] == "Shared Title"


@pytest.mark.asyncio
async def test_search_requires_query_parameter(client: AsyncClient):
    await signup_and_authenticate(client, "search_validation_user")

    response = await client.get("/api/notes/search")
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_search_escapes_regex_operators(client: AsyncClient):
    await signup_and_authenticate(client, "regex_search_user")
    await create_note(client, "Normal Note")

    # A regex injection attempt must not blow up nor match everything.
    response = await client.get("/api/notes/search", params={"q": ".*"})
    assert response.status_code == 200
    assert response.json() == []


# --- Get single note ---


@pytest.mark.asyncio
async def test_get_note_success(client: AsyncClient):
    await signup_and_authenticate(client, "get_note_user")

    created = await create_note(client, "Fetched Note")
    response = await client.get(f"/api/notes/{created['id']}")
    assert response.status_code == 200
    assert response.json()["id"] == created["id"]
    assert response.json()["title"] == "Fetched Note"


@pytest.mark.asyncio
async def test_get_note_not_found(client: AsyncClient):
    await signup_and_authenticate(client, "get_missing_user")

    response = await client.get(f"/api/notes/{ObjectId()}")
    assert response.status_code == 404
    assert "Note not found" in response.json()["detail"]


@pytest.mark.asyncio
async def test_get_note_invalid_id_format(client: AsyncClient):
    await signup_and_authenticate(client, "get_invalid_id_user")

    response = await client.get("/api/notes/garbage-id")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_note_isolated_from_other_users(client: AsyncClient):
    await signup_and_authenticate(client, "owner_get_user")
    secret_note = await create_note(client, "Secret Note")
    client.cookies.clear()

    await signup_and_authenticate(client, "foreign_get_user")
    response = await client.get(f"/api/notes/{secret_note['id']}")
    assert response.status_code == 404


# --- Update ---


@pytest.mark.asyncio
async def test_update_note_full_replace(client: AsyncClient, mock_db: AsyncIOMotorDatabase):
    await signup_and_authenticate(client, "update_user")

    created = await create_note(client, "Old Title")

    update_payload = {
        "title": "New Title",
        "layout_type": "canvas",
        "blocks": [{"id": "block-1", "type": "header-1", "properties": {"text": "Header"}}],
    }
    response = await client.put(f"/api/notes/{created['id']}", json=update_payload)
    assert response.status_code == 200

    updated = response.json()
    assert updated["title"] == "New Title"
    assert updated["layout_type"] == "canvas"
    assert len(updated["blocks"]) == 1

    stored = await mock_db.notes.find_one({"_id": ObjectId(created["id"])})
    assert stored["title"] == "New Title"
    assert stored["layout_type"] == "canvas"


@pytest.mark.asyncio
async def test_update_note_partial_keeps_other_fields(client: AsyncClient):
    await signup_and_authenticate(client, "partial_update_user")

    payload = {
        "title": "With Blocks",
        "blocks": [{"id": "b1", "type": "text", "properties": {"text": "kept"}}],
    }
    created = (await client.post("/api/notes", json=payload)).json()

    response = await client.put(f"/api/notes/{created['id']}", json={"title": "Renamed Only"})
    assert response.status_code == 200

    updated = response.json()
    assert updated["title"] == "Renamed Only"
    # Blocks must survive a title-only update.
    assert len(updated["blocks"]) == 1
    assert updated["blocks"][0]["properties"]["text"] == "kept"


@pytest.mark.asyncio
async def test_update_note_rejects_empty_title(client: AsyncClient):
    await signup_and_authenticate(client, "empty_title_user")

    created = await create_note(client, "Valid Title")
    response = await client.put(f"/api/notes/{created['id']}", json={"title": "  "})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_update_note_isolated_from_other_users(client: AsyncClient):
    await signup_and_authenticate(client, "update_owner_a")
    note = await create_note(client, "A's Note")
    client.cookies.clear()

    await signup_and_authenticate(client, "update_intruder_b")
    response = await client.put(f"/api/notes/{note['id']}", json={"title": "Hacked"})
    assert response.status_code == 404


# --- Delete ---


@pytest.mark.asyncio
async def test_delete_note_success(client: AsyncClient, mock_db: AsyncIOMotorDatabase):
    await signup_and_authenticate(client, "delete_user")

    created = await create_note(client, "Doomed Note")
    response = await client.delete(f"/api/notes/{created['id']}")
    assert response.status_code == 204

    stored = await mock_db.notes.find_one({"_id": ObjectId(created["id"])})
    assert stored is None


@pytest.mark.asyncio
async def test_delete_note_reparents_children_to_grandparent(
    client: AsyncClient, mock_db: AsyncIOMotorDatabase
):
    await signup_and_authenticate(client, "cascade_user")

    root = await create_note(client, "Root")
    middle = await create_note(client, "Middle", parent_id=root["id"])
    leaf = await create_note(client, "Leaf", parent_id=middle["id"])

    response = await client.delete(f"/api/notes/{middle['id']}")
    assert response.status_code == 204

    # Leaf must survive and now point at the deleted note's parent.
    stored_leaf = await mock_db.notes.find_one({"_id": ObjectId(leaf["id"])})
    assert stored_leaf is not None
    assert stored_leaf["parent_id"] == ObjectId(root["id"])


@pytest.mark.asyncio
async def test_delete_root_note_lifts_children_to_root(
    client: AsyncClient, mock_db: AsyncIOMotorDatabase
):
    await signup_and_authenticate(client, "cascade_root_user")

    root = await create_note(client, "Old Root")
    child = await create_note(client, "Promoted Child", parent_id=root["id"])

    response = await client.delete(f"/api/notes/{root['id']}")
    assert response.status_code == 204

    stored_child = await mock_db.notes.find_one({"_id": ObjectId(child["id"])})
    assert stored_child is not None
    assert stored_child["parent_id"] is None


@pytest.mark.asyncio
async def test_delete_note_isolated_from_other_users(
    client: AsyncClient, mock_db: AsyncIOMotorDatabase
):
    await signup_and_authenticate(client, "delete_owner_a")
    note = await create_note(client, "A's Precious Note")
    client.cookies.clear()

    await signup_and_authenticate(client, "delete_intruder_b")
    response = await client.delete(f"/api/notes/{note['id']}")
    assert response.status_code == 404

    # The note must still exist untouched.
    stored = await mock_db.notes.find_one({"_id": ObjectId(note["id"])})
    assert stored is not None
    assert stored["title"] == "A's Precious Note"


@pytest.mark.asyncio
async def test_delete_note_not_found(client: AsyncClient):
    await signup_and_authenticate(client, "delete_missing_user")

    response = await client.delete(f"/api/notes/{ObjectId()}")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_create_and_update_note_with_block_connections(client: AsyncClient):
    await signup_and_authenticate(client, "canvas_connector")

    create_payload = {
        "title": "Canvas Note with Connections",
        "layout_type": "canvas",
        "blocks": [
            {
                "id": "node-1",
                "type": "text",
                "properties": {"text": "Start node"},
                "canvas_metadata": {"x": 100, "y": 100, "width": 200, "height": 100},
            },
            {
                "id": "node-2",
                "type": "text",
                "properties": {"text": "Target node"},
                "canvas_metadata": {"x": 400, "y": 200, "width": 200, "height": 100},
            },
        ],
        "block_connections": [
            {"from_id": "node-1", "to_id": "node-2", "color": "#D1FF4D"}
        ],
    }
    res = await client.post("/api/notes", json=create_payload)
    assert res.status_code == 201
    created = res.json()
    assert created["layout_type"] == "canvas"
    assert len(created["block_connections"]) == 1
    assert created["block_connections"][0]["from_id"] == "node-1"
    assert created["block_connections"][0]["to_id"] == "node-2"

    note_id = created["id"]
    # Update connections
    update_payload = {
        "block_connections": [
            {"from_id": "node-1", "to_id": "node-2", "color": "#FFB800"},
            {"from_id": "node-2", "to_id": "node-1", "color": None},
        ]
    }
    update_res = await client.put(f"/api/notes/{note_id}", json=update_payload)
    assert update_res.status_code == 200
    updated = update_res.json()
    assert len(updated["block_connections"]) == 2
    assert updated["block_connections"][0]["color"] == "#FFB800"

    # Fetch note
    get_res = await client.get(f"/api/notes/{note_id}")
    assert get_res.status_code == 200
    assert len(get_res.json()["block_connections"]) == 2


# --- Auth guards ---


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "method,path",
    [
        ("POST", "/api/notes"),
        ("GET", "/api/notes"),
        ("GET", "/api/notes/trees"),
        ("GET", "/api/notes/search?q=test"),
        ("GET", f"/api/notes/{ObjectId()}"),
        ("PUT", f"/api/notes/{ObjectId()}"),
        ("DELETE", f"/api/notes/{ObjectId()}"),
    ],
)
async def test_notes_routes_require_authentication(client: AsyncClient, method: str, path: str):
    response = await client.request(method, path)
    assert response.status_code == 401
