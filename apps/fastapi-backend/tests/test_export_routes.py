"""Phase 7 export tests — markdown, json manifests, workspace/folder zips."""

import io
import json
import zipfile

import pytest
from httpx import AsyncClient
from motor.motor_asyncio import AsyncIOMotorDatabase

from fastapi_backend.config import settings

RICH_BLOCKS = [
    {"id": "b1", "type": "header-1", "properties": {"text": "Intro"}, "canvas_metadata": None},
    {"id": "b2", "type": "text", "properties": {"text": "Plain paragraph."}, "canvas_metadata": None},
    {"id": "b3", "type": "todo", "properties": {"text": "Ship it", "checked": True}, "canvas_metadata": None},
    {"id": "b4", "type": "todo", "properties": {"text": "Test it", "checked": False}, "canvas_metadata": None},
    {"id": "b5", "type": "list-item", "properties": {"text": "Item A"}, "canvas_metadata": None},
    {"id": "b6", "type": "code", "properties": {"text": "print('hi')", "language": "python"}, "canvas_metadata": None},
    {"id": "b7", "type": "divider", "properties": {}, "canvas_metadata": None},
    {"id": "b8", "type": "image", "properties": {"src": "https://example.com/pic.png"}, "canvas_metadata": None},
]


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


@pytest.mark.asyncio
async def test_single_note_markdown_export(client: AsyncClient):
    await _signup(client, "export_md_user")
    note = await _create_note(client, "Field Guide", blocks=RICH_BLOCKS)

    response = await client.get(f"/api/notes/{note['id']}/export", params={"format": "md"})
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/markdown")
    assert "attachment" in response.headers["content-disposition"]

    body = response.text
    assert body.startswith("# Field Guide")
    assert "# Intro" in body  # header-1 block renders as its own h1
    assert "Plain paragraph." in body
    assert "- [x] Ship it" in body
    assert "- [ ] Test it" in body
    assert "- Item A" in body
    assert "```python\nprint('hi')\n```" in body
    assert "---" in body
    assert "![image](https://example.com/pic.png)" in body
    # Consecutive todos stay one adjacent list.
    assert "- [x] Ship it\n- [ ] Test it" in body


@pytest.mark.asyncio
async def test_single_note_json_export_is_importable_manifest(client: AsyncClient):
    await _signup(client, "export_json_user")
    note = await _create_note(client, "Backup Target", blocks=RICH_BLOCKS)

    response = await client.get(f"/api/notes/{note['id']}/export", params={"format": "json"})
    assert response.status_code == 200

    manifest = response.json()
    assert manifest["schema_version"] == 1
    assert manifest["folders"] == []
    assert len(manifest["notes"]) == 1

    exported = manifest["notes"][0]
    assert exported["title"] == "Backup Target"
    assert exported["path"] == []
    assert len(exported["blocks"]) == len(RICH_BLOCKS)
    assert exported["blocks"][0]["id"] == "b1"
    assert exported["blocks"][2]["properties"]["checked"] is True


@pytest.mark.asyncio
async def test_note_export_is_flat_regardless_of_folder(client: AsyncClient):
    """User decision: file exports carry NO folder nesting — importing
    lands the note at the workspace root, wherever it lived before."""
    await _signup(client, "export_path_user")
    root = await _create_folder(client, "Rack One")
    nested = await _create_folder(client, "Rack Two", parent=root["id"])
    note = await _create_note(client, "Nested Note", folder_id=nested["id"])

    response = await client.get(f"/api/notes/{note['id']}/export", params={"format": "json"})
    manifest = response.json()
    assert manifest["folders"] == []
    assert manifest["notes"][0]["path"] == []


@pytest.mark.asyncio
async def test_workspace_zip_mirrors_folder_tree(client: AsyncClient):
    await _signup(client, "export_zip_user")
    folder = await _create_folder(client, "Heroes")
    sub = await _create_folder(client, "Legends", parent=folder["id"])
    await _create_note(client, "Root Note")
    await _create_note(client, "Hero Note", folder_id=folder["id"])
    await _create_note(client, "Legend Note", folder_id=sub["id"])
    # Duplicate titles inside one folder must not collide.
    await _create_note(client, "Hero Note", folder_id=folder["id"])

    response = await client.get("/api/notes/export", params={"format": "zip"})
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert "workspace-notes.zip" in response.headers["content-disposition"]

    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        names = sorted(archive.namelist())
    assert names == [
        "Heroes/Hero-Note-2.md",
        "Heroes/Hero-Note.md",
        "Heroes/Legends/Legend-Note.md",
        "Root-Note.md",
    ]

    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        legend = archive.read("Heroes/Legends/Legend-Note.md").decode()
    assert legend.startswith("# Legend Note")


@pytest.mark.asyncio
async def test_workspace_json_manifest_shape(client: AsyncClient):
    await _signup(client, "export_manifest_user")
    folder = await _create_folder(client, "Machines")
    await _create_note(client, "Folder Note", folder_id=folder["id"])
    await _create_note(client, "Loose Note")

    response = await client.get("/api/notes/export", params={"format": "json"})
    assert response.status_code == 200
    manifest = response.json()

    assert manifest["schema_version"] == 1
    assert "exported_at" in manifest
    assert manifest["folders"] == [
        {"name": "Machines", "path": [], "color": None,
         "created_at": manifest["folders"][0]["created_at"],
         "updated_at": manifest["folders"][0]["updated_at"]}
    ]
    paths = sorted(
        (note["title"], tuple(note["path"])) for note in manifest["notes"]
    )
    assert paths == [("Folder Note", ("Machines",)), ("Loose Note", ())]


@pytest.mark.asyncio
async def test_folder_zip_and_json_export(client: AsyncClient):
    """Folder exports are FLAT (user decision): every descendant note at
    the root of the zip/manifest — no folder nesting is re-created on
    import; nesting survives only in full-workspace backups."""
    await _signup(client, "folder_export_user")
    root = await _create_folder(client, "Project")
    sub = await _create_folder(client, "Docs", parent=root["id"])
    await _create_note(client, "Outside Note")  # must NOT appear
    await _create_note(client, "Root Doc", folder_id=root["id"])
    await _create_note(client, "Sub Doc", folder_id=sub["id"])

    zip_response = await client.get(
        f"/api/folders/{root['id']}/export", params={"format": "zip"}
    )
    assert zip_response.status_code == 200
    with zipfile.ZipFile(io.BytesIO(zip_response.content)) as archive:
        names = sorted(archive.namelist())
    # Flat — every file directly at the archive root.
    assert names == ["Root-Doc.md", "Sub-Doc.md"]

    json_response = await client.get(
        f"/api/folders/{root['id']}/export", params={"format": "json"}
    )
    manifest = json_response.json()
    assert json_response.status_code == 200
    assert manifest["folders"] == []
    assert sorted(note["title"] for note in manifest["notes"]) == [
        "Root Doc",
        "Sub Doc",
    ]
    assert all(note["path"] == [] for note in manifest["notes"])


@pytest.mark.asyncio
async def test_markdown_export_drops_drawing_blocks(client: AsyncClient):
    """Drawings are canvas-internal strokes — raw markdown must not
    carry them (user decision). Images stay; JSON keeps everything."""
    await _signup(client, "export_drawing_user")
    note = await _create_note(
        client,
        "Sketch",
        blocks=[
            {"id": "d1", "type": "text", "properties": {"text": "Before"}, "canvas_metadata": None},
            {
                "id": "d2",
                "type": "drawing",
                "properties": {"src": "data:image/png;base64,iVBORw0KGgo="},
                "canvas_metadata": None,
            },
            {"id": "d3", "type": "text", "properties": {"text": "After"}, "canvas_metadata": None},
        ],
    )

    response = await client.get(f"/api/notes/{note['id']}/export", params={"format": "md"})
    assert response.status_code == 200
    assert "Before" in response.text
    assert "After" in response.text
    assert "drawing" not in response.text
    assert "iVBORw0KGgo" not in response.text

    json_response = await client.get(
        f"/api/notes/{note['id']}/export", params={"format": "json"}
    )
    manifest = json_response.json()
    assert [b["type"] for b in manifest["notes"][0]["blocks"]] == [
        "text",
        "drawing",
        "text",
    ]


@pytest.mark.asyncio
async def test_export_foreign_note_is_404(client: AsyncClient):
    await _signup(client, "export_owner_a")
    note = await _create_note(client, "A's Note")

    await _signup(client, "export_owner_b")
    response = await client.get(f"/api/notes/{note['id']}/export", params={"format": "md"})
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_export_rejects_unknown_format(client: AsyncClient):
    await _signup(client, "export_format_user")
    note = await _create_note(client, "Format Test")

    response = await client.get(f"/api/notes/{note['id']}/export", params={"format": "pdf"})
    assert response.status_code == 422
    response = await client.get("/api/notes/export", params={"format": "md"})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_canvas_note_md_includes_canvas_json_flag(client: AsyncClient):
    await _signup(client, "export_canvas_user")
    note = await _create_note(
        client,
        "Canvas Board",
        blocks=[
            {
                "id": "c1",
                "type": "text",
                "properties": {"text": "Node text"},
                "canvas_metadata": {"x": 120.0, "y": 80.0, "width": 220.0, "height": 90.0, "color": None},
            }
        ],
    )

    plain = await client.get(f"/api/notes/{note['id']}/export", params={"format": "md"})
    assert "canvas_metadata" not in plain.text
    assert plain.text.count("```") == 0

    flagged = await client.get(
        f"/api/notes/{note['id']}/export",
        params={"format": "md", "include_canvas_json": "true"},
    )
    assert "```json" in flagged.text
    assert '"x": 120.0' in flagged.text


def test_content_disposition_preserves_extension_in_utf8_name():
    """The unicode slug strips dots, so `filename*` used to drop the
    extension ("Field-Guidemd") — browsers prefer filename*, which made
    downloaded files extensionless. Both names must keep the ext."""
    from fastapi_backend.exporting import service

    header = service.content_disposition("Field Guide.md")
    assert 'filename="Field-Guide.md"' in header
    assert "filename*=UTF-8''Field-Guide.md" in header

    header = service.content_disposition("workspace-backup.json")
    assert 'filename="workspace-backup.json"' in header
    assert "filename*=UTF-8''workspace-backup.json" in header
