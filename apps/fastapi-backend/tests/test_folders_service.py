from datetime import datetime, timedelta, timezone

import pytest
from bson import ObjectId
from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from fastapi_backend.folders import service
from fastapi_backend.folders.models import FolderCreate, FolderUpdate
from fastapi_backend.notes.models import NoteListItem

USER_ID = "507f1f77bcf86cd799439011"


def make_folder_doc(
    folder_id: str,
    parent_folder_id: str | None = None,
    name: str = "Folder",
    minutes_offset: int = 0,
    user_id: str = USER_ID,
) -> dict:
    """Build a minimal folder document matching FOLDER_LIST_PROJECTION."""
    created = datetime.now(timezone.utc) + timedelta(minutes=minutes_offset)
    return {
        "_id": ObjectId(folder_id),
        "user_id": ObjectId(user_id),
        "parent_folder_id": (
            ObjectId(parent_folder_id) if parent_folder_id is not None else None
        ),
        "name": name,
        "order": 0,
        "created_at": created,
        "updated_at": created,
    }


def make_note_doc(
    note_id: str,
    folder_id: str | None = None,
    title: str = "Note",
    minutes_offset: int = 0,
    user_id: str = USER_ID,
) -> dict:
    """Build a minimal note document matching LIST_PROJECTION output."""
    created = datetime.now(timezone.utc) + timedelta(minutes=minutes_offset)
    return {
        "_id": ObjectId(note_id),
        "user_id": ObjectId(user_id),
        "folder_id": ObjectId(folder_id) if folder_id is not None else None,
        "title": title,
        "layout_type": "document",
        "emoji_icon": None,
        "is_published": False,
        "created_at": created,
        "updated_at": created,
    }


# --- create_folder ---


@pytest.mark.asyncio
async def test_create_root_folder(mock_db: AsyncIOMotorDatabase):
    doc = await service.create_folder(mock_db, USER_ID, FolderCreate(name="Rack One"))
    assert doc["name"] == "Rack One"
    assert doc["parent_folder_id"] is None
    assert doc["order"] == 0

    stored = await mock_db.folders.find_one({"_id": doc["_id"]})
    assert stored is not None
    assert stored["user_id"] == ObjectId(USER_ID)


@pytest.mark.asyncio
async def test_create_nested_folder(mock_db: AsyncIOMotorDatabase):
    parent = await service.create_folder(mock_db, USER_ID, FolderCreate(name="Parent"))
    child = await service.create_folder(
        mock_db,
        USER_ID,
        FolderCreate(name="Child", parent_folder_id=str(parent["_id"])),
    )
    assert child["parent_folder_id"] == parent["_id"]


@pytest.mark.asyncio
async def test_create_folder_with_foreign_parent_is_404(
    mock_db: AsyncIOMotorDatabase,
):
    foreign = make_folder_doc("507f1f77bcf86cd799439201", user_id="507f1f77bcf86cd799439999")
    await mock_db.folders.insert_one(foreign)

    with pytest.raises(HTTPException) as exc_info:
        await service.create_folder(
            mock_db,
            USER_ID,
            FolderCreate(name="Intruder", parent_folder_id="507f1f77bcf86cd799439201"),
        )
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_create_folder_with_missing_parent_is_404(
    mock_db: AsyncIOMotorDatabase,
):
    with pytest.raises(HTTPException) as exc_info:
        await service.create_folder(
            mock_db,
            USER_ID,
            FolderCreate(name="Orphan", parent_folder_id=str(ObjectId())),
        )
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_create_folder_with_malformed_parent_is_400(
    mock_db: AsyncIOMotorDatabase,
):
    with pytest.raises(HTTPException) as exc_info:
        await service.create_folder(
            mock_db, USER_ID, FolderCreate(name="Bad", parent_folder_id="not-an-objectid")
        )
    assert exc_info.value.status_code == 400


# --- update_folder ---


@pytest.mark.asyncio
async def test_rename_folder(mock_db: AsyncIOMotorDatabase):
    created = await service.create_folder(mock_db, USER_ID, FolderCreate(name="Old Name"))
    updated = await service.update_folder(
        mock_db, created, FolderUpdate(name="New Name")
    )
    assert updated["name"] == "New Name"
    assert updated["parent_folder_id"] is None


@pytest.mark.asyncio
async def test_move_folder_to_root_via_explicit_null(
    mock_db: AsyncIOMotorDatabase,
):
    parent = await service.create_folder(mock_db, USER_ID, FolderCreate(name="Parent"))
    child = await service.create_folder(
        mock_db, USER_ID, FolderCreate(name="Child", parent_folder_id=str(parent["_id"]))
    )

    updated = await service.update_folder(mock_db, child, FolderUpdate(parent_folder_id=None))
    assert updated["parent_folder_id"] is None


@pytest.mark.asyncio
async def test_update_folder_omitted_parent_keeps_location(
    mock_db: AsyncIOMotorDatabase,
):
    parent = await service.create_folder(mock_db, USER_ID, FolderCreate(name="Parent"))
    child = await service.create_folder(
        mock_db, USER_ID, FolderCreate(name="Child", parent_folder_id=str(parent["_id"]))
    )

    # Rename only — the omitted parent_folder_id must not move the folder.
    updated = await service.update_folder(mock_db, child, FolderUpdate(name="Renamed"))
    assert updated["parent_folder_id"] == parent["_id"]


@pytest.mark.asyncio
async def test_move_folder_into_itself_is_400(mock_db: AsyncIOMotorDatabase):
    folder = await service.create_folder(mock_db, USER_ID, FolderCreate(name="Self"))
    with pytest.raises(HTTPException) as exc_info:
        await service.update_folder(
            mock_db, folder, FolderUpdate(parent_folder_id=str(folder["_id"]))
        )
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_move_folder_into_its_descendant_is_400(
    mock_db: AsyncIOMotorDatabase,
):
    root = await service.create_folder(mock_db, USER_ID, FolderCreate(name="Root"))
    middle = await service.create_folder(
        mock_db, USER_ID, FolderCreate(name="Middle", parent_folder_id=str(root["_id"]))
    )
    leaf = await service.create_folder(
        mock_db, USER_ID, FolderCreate(name="Leaf", parent_folder_id=str(middle["_id"]))
    )

    # Moving root under leaf (or middle) would create a cycle.
    with pytest.raises(HTTPException) as exc_info:
        await service.update_folder(
            mock_db, root, FolderUpdate(parent_folder_id=str(leaf["_id"]))
        )
    assert exc_info.value.status_code == 400

    with pytest.raises(HTTPException) as exc_info:
        await service.update_folder(
            mock_db, root, FolderUpdate(parent_folder_id=str(middle["_id"]))
        )
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_move_folder_under_foreign_target_is_404(
    mock_db: AsyncIOMotorDatabase,
):
    foreign = make_folder_doc("507f1f77bcf86cd799439301", user_id="507f1f77bcf86cd799439999")
    await mock_db.folders.insert_one(foreign)
    folder = await service.create_folder(mock_db, USER_ID, FolderCreate(name="Mover"))

    with pytest.raises(HTTPException) as exc_info:
        await service.update_folder(
            mock_db, folder, FolderUpdate(parent_folder_id="507f1f77bcf86cd799439301")
        )
    assert exc_info.value.status_code == 404


# --- delete_folder (lift, never cascade) ---


@pytest.mark.asyncio
async def test_delete_folder_lifts_notes_and_subfolders(
    mock_db: AsyncIOMotorDatabase,
):
    root = await service.create_folder(mock_db, USER_ID, FolderCreate(name="Root"))
    middle = await service.create_folder(
        mock_db, USER_ID, FolderCreate(name="Middle", parent_folder_id=str(root["_id"]))
    )
    leaf_folder = await service.create_folder(
        mock_db, USER_ID, FolderCreate(name="Leaf Folder", parent_folder_id=str(middle["_id"]))
    )

    note_doc = make_note_doc("507f1f77bcf86cd799439401", folder_id=str(middle["_id"]))
    await mock_db.notes.insert_one(note_doc)

    await service.delete_folder(mock_db, middle)

    # Middle is gone; its note + sub-folder lifted to middle's parent.
    assert await mock_db.folders.find_one({"_id": middle["_id"]}) is None
    stored_note = await mock_db.notes.find_one({"_id": ObjectId("507f1f77bcf86cd799439401")})
    assert stored_note is not None
    assert stored_note["folder_id"] == root["_id"]
    stored_leaf = await mock_db.folders.find_one({"_id": leaf_folder["_id"]})
    assert stored_leaf is not None
    assert stored_leaf["parent_folder_id"] == root["_id"]


@pytest.mark.asyncio
async def test_delete_root_folder_lifts_contents_to_root(
    mock_db: AsyncIOMotorDatabase,
):
    root = await service.create_folder(mock_db, USER_ID, FolderCreate(name="Root"))
    note_doc = make_note_doc("507f1f77bcf86cd799439402", folder_id=str(root["_id"]))
    await mock_db.notes.insert_one(note_doc)

    await service.delete_folder(mock_db, root)

    stored_note = await mock_db.notes.find_one({"_id": ObjectId("507f1f77bcf86cd799439402")})
    assert stored_note is not None
    assert stored_note["folder_id"] is None


# --- build_workspace_tree ---


def test_build_workspace_tree_shape_and_ordering():
    folder_a = make_folder_doc("507f1f77bcf86cd799439001", name="Folder A", minutes_offset=0)
    folder_b = make_folder_doc("507f1f77bcf86cd799439002", name="Folder B", minutes_offset=1)
    folder_b1 = make_folder_doc(
        "507f1f77bcf86cd799439003",
        parent_folder_id="507f1f77bcf86cd799439002",
        name="Folder B1",
        minutes_offset=2,
    )
    root_note = make_note_doc("507f1f77bcf86cd799439101", title="Root Note", minutes_offset=1)
    note_in_a = make_note_doc(
        "507f1f77bcf86cd799439102", folder_id="507f1f77bcf86cd799439001", title="Note in A", minutes_offset=2
    )
    note_in_b1 = make_note_doc(
        "507f1f77bcf86cd799439103",
        folder_id="507f1f77bcf86cd799439003",
        title="Note in B1",
        minutes_offset=3,
    )

    tree = service.build_workspace_tree(
        [folder_a, folder_b, folder_b1], [root_note, note_in_a, note_in_b1]
    )

    # Roots: folders before notes, creation order within each.
    assert [f.name for f in tree.folders] == ["Folder A", "Folder B"]
    assert [n.title for n in tree.notes] == ["Root Note"]

    folder_a_item = tree.folders[0]
    folder_b_item = tree.folders[1]
    assert folder_a_item.folders == []
    assert [n.title for n in folder_a_item.notes] == ["Note in A"]
    assert [f.name for f in folder_b_item.folders] == ["Folder B1"]
    assert [n.title for n in folder_b_item.folders[0].notes] == ["Note in B1"]


def test_build_workspace_tree_dangling_references_surface_at_root():
    # Note pointing at a missing folder + folder pointing at a missing
    # parent must stay visible as roots.
    orphan_folder = make_folder_doc(
        "507f1f77bcf86cd799439001", parent_folder_id="507f1f77bcf86cd799439999", name="Orphan Folder"
    )
    orphan_note = make_note_doc(
        "507f1f77bcf86cd799439101", folder_id="507f1f77bcf86cd799439999", title="Orphan Note"
    )

    tree = service.build_workspace_tree([orphan_folder], [orphan_note])

    assert [f.name for f in tree.folders] == ["Orphan Folder"]
    assert [n.title for n in tree.notes] == ["Orphan Note"]
    assert tree.folders[0].notes == []


def test_build_workspace_tree_cycle_surfaces_as_root():
    # Two folders parenting each other (impossible via the API, possible
    # via out-of-API writes) must not vanish or hang.
    folder_x = make_folder_doc(
        "507f1f77bcf86cd799439001", parent_folder_id="507f1f77bcf86cd799439002", name="X"
    )
    folder_y = make_folder_doc(
        "507f1f77bcf86cd799439002", parent_folder_id="507f1f77bcf86cd799439001", name="Y"
    )

    tree = service.build_workspace_tree([folder_x, folder_y], [])

    assert sorted(f.name for f in tree.folders) == ["X", "Y"]
    # Cycle victims detach cleanly: no folder stays nested inside its
    # cycle partner (a cyclic graph would recurse forever when the
    # workspace endpoint serializes it) and the stale parent pointer
    # reads as a root.
    for item in tree.folders:
        assert item.parent_folder_id is None
        assert item.folders == []
    # Serialization completes — the guard exists precisely so this
    # endpoint can serve corrupted data instead of crashing on it.
    assert "X" in tree.model_dump_json()


def test_build_workspace_tree_empty_input():
    tree = service.build_workspace_tree([], [])
    assert tree.folders == []
    assert tree.notes == []


def test_note_list_item_from_mongo_without_folder_id_reads_as_root():
    # Documents created before the folder split (no folder_id field) must
    # deserialize as root notes, not error.
    doc = make_note_doc("507f1f77bcf86cd799439101")
    del doc["folder_id"]

    item = NoteListItem.from_mongo(doc)
    assert item.folder_id is None
    assert item.title == "Note"


# --- color (Phase 6 accent) ---


@pytest.mark.asyncio
async def test_create_folder_with_color(mock_db: AsyncIOMotorDatabase):
    doc = await service.create_folder(
        mock_db, USER_ID, FolderCreate(name="Amber Rack", color="amber")
    )
    assert doc["color"] == "amber"

    plain = await service.create_folder(mock_db, USER_ID, FolderCreate(name="Plain"))
    assert plain["color"] is None


def test_folder_models_reject_unknown_color():
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        FolderCreate(name="Bad", color="neon-pink")
    with pytest.raises(ValidationError):
        FolderUpdate(color="red")


def test_folder_models_normalize_color():
    assert FolderCreate(name="Ok", color=" Amber ").color == "amber"
    assert FolderUpdate(color="").color is None


@pytest.mark.asyncio
async def test_update_folder_color_set_and_clear(mock_db: AsyncIOMotorDatabase):
    created = await service.create_folder(
        mock_db, USER_ID, FolderCreate(name="Tint", color="amber")
    )
    stored = await mock_db.folders.find_one({"_id": created["_id"]})
    assert stored is not None

    # Omitted color keeps the current accent.
    kept = await service.update_folder(
        mock_db, stored, FolderUpdate(name="Tinted")
    )
    assert kept["color"] == "amber"

    # A new key replaces it.
    changed = await service.update_folder(
        mock_db, kept, FolderUpdate(color="mint")
    )
    assert changed["color"] == "mint"

    # Explicit null clears it.
    cleared = await service.update_folder(
        mock_db, changed, FolderUpdate.model_validate({"color": None})
    )
    assert cleared["color"] is None


def test_build_workspace_tree_carries_color():
    folder_doc = make_folder_doc("507f1f77bcf86cd799420001")
    folder_doc["color"] = "sky"
    note_doc = make_note_doc("507f1f77bcf86cd799420002")
    note_doc["color"] = "rose"

    tree = service.build_workspace_tree([folder_doc], [note_doc])
    assert tree.folders[0].color == "sky"
    assert tree.notes[0].color == "rose"
