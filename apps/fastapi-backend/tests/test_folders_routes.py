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


async def create_folder(
    client: AsyncClient, name: str, parent_folder_id: str | None = None
) -> dict:
    payload: dict = {"name": name}
    if parent_folder_id is not None:
        payload["parent_folder_id"] = parent_folder_id
    response = await client.post("/api/folders", json=payload)
    assert response.status_code == 201
    return response.json()


async def create_note(
    client: AsyncClient, title: str, folder_id: str | None = None
) -> dict:
    payload: dict = {"title": title}
    if folder_id is not None:
        payload["folder_id"] = folder_id
    response = await client.post("/api/notes", json=payload)
    assert response.status_code == 201
    return response.json()


# --- Create ---


@pytest.mark.asyncio
async def test_create_folder_success(client: AsyncClient, mock_db: AsyncIOMotorDatabase):
    await signup_and_authenticate(client, "folder_creator")

    folder = await create_folder(client, "Rack One")

    assert folder["name"] == "Rack One"
    assert folder["parent_folder_id"] is None
    assert folder["order"] == 0
    assert "id" in folder

    stored = await mock_db.folders.find_one({"_id": ObjectId(folder["id"])})
    assert stored is not None
    assert stored["name"] == "Rack One"


@pytest.mark.asyncio
async def test_create_nested_folder(client: AsyncClient):
    await signup_and_authenticate(client, "nested_folder_creator")

    parent = await create_folder(client, "Parent")
    child = await create_folder(client, "Child", parent_folder_id=parent["id"])

    assert child["parent_folder_id"] == parent["id"]


@pytest.mark.asyncio
async def test_create_folder_parent_not_found(client: AsyncClient):
    await signup_and_authenticate(client, "folder_orphan_user")

    response = await client.post(
        "/api/folders", json={"name": "Note", "parent_folder_id": str(ObjectId())}
    )
    assert response.status_code == 404
    assert "Parent folder not found" in response.json()["detail"]


@pytest.mark.asyncio
async def test_create_folder_malformed_parent_id(client: AsyncClient):
    await signup_and_authenticate(client, "folder_malformed_user")

    response = await client.post(
        "/api/folders", json={"name": "Note", "parent_folder_id": "not-an-objectid"}
    )
    assert response.status_code == 400
    assert "Invalid parent_folder_id" in response.json()["detail"]


@pytest.mark.asyncio
async def test_create_folder_validation_errors(client: AsyncClient):
    await signup_and_authenticate(client, "folder_validation_user")

    # Whitespace-only name (empty after strip)
    res = await client.post("/api/folders", json={"name": "   "})
    assert res.status_code == 422

    # Name too long
    res = await client.post("/api/folders", json={"name": "x" * 201})
    assert res.status_code == 422


# --- List ---


@pytest.mark.asyncio
async def test_list_folders_returns_only_owned_and_creation_order(client: AsyncClient):
    await signup_and_authenticate(client, "folder_owner_list")
    await create_folder(client, "First")
    await create_folder(client, "Second")
    client.cookies.clear()

    await signup_and_authenticate(client, "folder_other_list")
    await create_folder(client, "Theirs")

    response = await client.get("/api/folders")
    assert response.status_code == 200
    folders = response.json()
    assert len(folders) == 1
    assert folders[0]["name"] == "Theirs"


# --- Get single ---


@pytest.mark.asyncio
async def test_get_folder_success(client: AsyncClient):
    await signup_and_authenticate(client, "get_folder_user")

    created = await create_folder(client, "Fetched Folder")
    response = await client.get(f"/api/folders/{created['id']}")
    assert response.status_code == 200
    assert response.json()["id"] == created["id"]
    assert response.json()["name"] == "Fetched Folder"


@pytest.mark.asyncio
async def test_get_folder_not_found(client: AsyncClient):
    await signup_and_authenticate(client, "get_missing_folder_user")

    response = await client.get(f"/api/folders/{ObjectId()}")
    assert response.status_code == 404
    assert "Folder not found" in response.json()["detail"]


@pytest.mark.asyncio
async def test_get_folder_invalid_id_format(client: AsyncClient):
    await signup_and_authenticate(client, "get_invalid_folder_user")

    response = await client.get("/api/folders/garbage-id")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_folder_isolated_from_other_users(client: AsyncClient):
    await signup_and_authenticate(client, "folder_owner_get")
    secret = await create_folder(client, "Secret Folder")
    client.cookies.clear()

    await signup_and_authenticate(client, "folder_foreign_get")
    response = await client.get(f"/api/folders/{secret['id']}")
    assert response.status_code == 404


# --- Update (rename + move) ---


@pytest.mark.asyncio
async def test_rename_folder_over_http(client: AsyncClient):
    await signup_and_authenticate(client, "rename_folder_user")

    created = await create_folder(client, "Old Name")
    response = await client.put(f"/api/folders/{created['id']}", json={"name": "New Name"})
    assert response.status_code == 200
    assert response.json()["name"] == "New Name"
    assert response.json()["parent_folder_id"] is None


@pytest.mark.asyncio
async def test_move_folder_to_root_over_http(client: AsyncClient):
    await signup_and_authenticate(client, "move_folder_root_user")

    parent = await create_folder(client, "Parent")
    child = await create_folder(client, "Child", parent_folder_id=parent["id"])

    response = await client.put(f"/api/folders/{child['id']}", json={"parent_folder_id": None})
    assert response.status_code == 200
    assert response.json()["parent_folder_id"] is None


@pytest.mark.asyncio
async def test_move_folder_into_descendant_rejected_over_http(client: AsyncClient):
    await signup_and_authenticate(client, "folder_cycle_user")

    root = await create_folder(client, "Root")
    child = await create_folder(client, "Child", parent_folder_id=root["id"])

    response = await client.put(f"/api/folders/{root['id']}", json={"parent_folder_id": child["id"]})
    assert response.status_code == 400
    assert "cycle" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_move_folder_into_itself_rejected_over_http(client: AsyncClient):
    await signup_and_authenticate(client, "folder_self_user")

    folder = await create_folder(client, "Self")

    response = await client.put(
        f"/api/folders/{folder['id']}", json={"parent_folder_id": folder["id"]}
    )
    assert response.status_code == 400


# --- Delete (lift, never cascade) ---


@pytest.mark.asyncio
async def test_delete_folder_lifts_contents_over_http(
    client: AsyncClient, mock_db: AsyncIOMotorDatabase
):
    await signup_and_authenticate(client, "delete_folder_user")

    root = await create_folder(client, "Root")
    middle = await create_folder(client, "Middle", parent_folder_id=root["id"])
    sub_folder = await create_folder(client, "Sub", parent_folder_id=middle["id"])
    note = await create_note(client, "Filed Note", folder_id=middle["id"])

    response = await client.delete(f"/api/folders/{middle['id']}")
    assert response.status_code == 204

    # Folder is gone; note + sub-folder lifted to middle's parent.
    assert await mock_db.folders.find_one({"_id": ObjectId(middle["id"])}) is None
    stored_note = await mock_db.notes.find_one({"_id": ObjectId(note["id"])})
    assert stored_note is not None
    assert stored_note["folder_id"] == ObjectId(root["id"])
    stored_sub = await mock_db.folders.find_one({"_id": ObjectId(sub_folder["id"])})
    assert stored_sub is not None
    assert stored_sub["parent_folder_id"] == ObjectId(root["id"])


@pytest.mark.asyncio
async def test_delete_folder_not_found(client: AsyncClient):
    await signup_and_authenticate(client, "delete_missing_folder_user")

    response = await client.delete(f"/api/folders/{ObjectId()}")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_delete_folder_isolated_from_other_users(
    client: AsyncClient, mock_db: AsyncIOMotorDatabase
):
    await signup_and_authenticate(client, "folder_delete_owner")
    folder = await create_folder(client, "A's Precious Folder")
    client.cookies.clear()

    await signup_and_authenticate(client, "folder_delete_intruder")
    response = await client.delete(f"/api/folders/{folder['id']}")
    assert response.status_code == 404

    stored = await mock_db.folders.find_one({"_id": ObjectId(folder["id"])})
    assert stored is not None


# --- Workspace tree ---


@pytest.mark.asyncio
async def test_workspace_endpoint_returns_combined_tree(client: AsyncClient):
    await signup_and_authenticate(client, "workspace_user")

    folder_a = await create_folder(client, "Folder A")
    folder_b = await create_folder(client, "Folder B")
    folder_b1 = await create_folder(client, "Folder B1", parent_folder_id=folder_b["id"])

    await create_note(client, "Root Note")
    await create_note(client, "Note in A", folder_id=folder_a["id"])
    await create_note(client, "Note in B1", folder_id=folder_b1["id"])

    response = await client.get("/api/workspace")
    assert response.status_code == 200
    workspace = response.json()

    assert [f["name"] for f in workspace["folders"]] == ["Folder A", "Folder B"]
    assert [n["title"] for n in workspace["notes"]] == ["Root Note"]

    folder_b_item = workspace["folders"][1]
    assert [f["name"] for f in folder_b_item["folders"]] == ["Folder B1"]
    assert [n["title"] for n in folder_b_item["folders"][0]["notes"]] == ["Note in B1"]
    assert [n["title"] for n in folder_b_item["notes"]] == []


@pytest.mark.asyncio
async def test_workspace_isolated_by_user(client: AsyncClient):
    await signup_and_authenticate(client, "workspace_owner_a")
    await create_folder(client, "A's Folder")
    client.cookies.clear()

    await signup_and_authenticate(client, "workspace_owner_b")
    response = await client.get("/api/workspace")
    assert response.status_code == 200
    workspace = response.json()
    assert workspace["folders"] == []
    assert workspace["notes"] == []


# --- Auth guards ---


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "method,path",
    [
        ("POST", "/api/folders"),
        ("GET", "/api/folders"),
        ("GET", f"/api/folders/{ObjectId()}"),
        ("PUT", f"/api/folders/{ObjectId()}"),
        ("DELETE", f"/api/folders/{ObjectId()}"),
        ("GET", "/api/workspace"),
    ],
)
async def test_folder_routes_require_authentication(
    client: AsyncClient, method: str, path: str
):
    response = await client.request(method, path)
    assert response.status_code == 401


# --- color (Phase 6 accent) ---


@pytest.mark.asyncio
async def test_folder_color_over_http(client: AsyncClient):
    await signup_and_authenticate(client, "folder_color_user")

    response = await client.post(
        "/api/folders", json={"name": "Tinted", "color": "amber"}
    )
    assert response.status_code == 201
    folder = response.json()
    assert folder["color"] == "amber"

    # Change the accent.
    response = await client.put(
        f"/api/folders/{folder['id']}", json={"color": "mint"}
    )
    assert response.status_code == 200
    assert response.json()["color"] == "mint"

    # Omitted color keeps it (rename-only update).
    response = await client.put(
        f"/api/folders/{folder['id']}", json={"name": "Still Tinted"}
    )
    assert response.status_code == 200
    assert response.json()["color"] == "mint"

    # Explicit null clears it.
    response = await client.put(
        f"/api/folders/{folder['id']}", json={"color": None}
    )
    assert response.status_code == 200
    assert response.json()["color"] is None


@pytest.mark.asyncio
async def test_folder_color_rejects_unknown_key(client: AsyncClient):
    await signup_and_authenticate(client, "folder_color_invalid_user")
    response = await client.post(
        "/api/folders", json={"name": "Bad Tint", "color": "neon-pink"}
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_workspace_tree_carries_color(client: AsyncClient):
    await signup_and_authenticate(client, "workspace_color_user")

    await client.post(
        "/api/folders", json={"name": "Sky Rack", "color": "sky"}
    )
    await client.post(
        "/api/notes", json={"title": "Rose Note", "color": "rose"}
    )

    response = await client.get("/api/workspace")
    assert response.status_code == 200
    workspace = response.json()
    assert workspace["folders"][0]["color"] == "sky"
    assert workspace["notes"][0]["color"] == "rose"
