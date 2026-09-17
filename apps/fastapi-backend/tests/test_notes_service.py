from datetime import datetime, timedelta, timezone

from bson import ObjectId

from fastapi_backend.notes.service import build_tree


def make_note_doc(
    note_id: str,
    parent_id: str | None = None,
    title: str = "Note",
    minutes_offset: int = 0,
) -> dict:
    """Build a minimal note document matching LIST_PROJECTION output."""
    created = datetime.now(timezone.utc) + timedelta(minutes=minutes_offset)
    return {
        "_id": ObjectId(note_id),
        "user_id": ObjectId("507f1f77bcf86cd799439011"),
        "parent_id": ObjectId(parent_id) if parent_id is not None else None,
        "title": title,
        "layout_type": "document",
        "emoji_icon": None,
        "is_published": False,
        "created_at": created,
        "updated_at": created,
    }


def test_build_tree_nested_structure():
    root = make_note_doc("507f1f77bcf86cd799439001", title="Root")
    child_a = make_note_doc("507f1f77bcf86cd799439002", parent_id="507f1f77bcf86cd799439001", title="Child A")
    grandchild = make_note_doc("507f1f77bcf86cd799439003", parent_id="507f1f77bcf86cd799439002", title="Grandchild")
    child_b = make_note_doc("507f1f77bcf86cd799439004", parent_id="507f1f77bcf86cd799439001", title="Child B")

    tree = build_tree([root, child_a, grandchild, child_b])

    assert len(tree) == 1
    assert tree[0].title == "Root"
    assert len(tree[0].children) == 2
    assert [c.title for c in tree[0].children] == ["Child A", "Child B"]
    assert len(tree[0].children[0].children) == 1
    assert tree[0].children[0].children[0].title == "Grandchild"


def test_build_tree_dangling_parent_becomes_root():
    # A note pointing at a deleted/missing parent must stay visible.
    orphan = make_note_doc("507f1f77bcf86cd799439002", parent_id="507f1f77bcf86cd799439099", title="Orphan")
    root = make_note_doc("507f1f77bcf86cd799439001", title="Root")

    tree = build_tree([orphan, root])

    assert len(tree) == 2
    titles = {item.title for item in tree}
    assert titles == {"Orphan", "Root"}


def test_build_tree_children_preserve_creation_order():
    root = make_note_doc("507f1f77bcf86cd799439001", title="Root")
    first = make_note_doc("507f1f77bcf86cd799439002", parent_id="507f1f77bcf86cd799439001", title="First", minutes_offset=1)
    second = make_note_doc("507f1f77bcf86cd799439003", parent_id="507f1f77bcf86cd799439001", title="Second", minutes_offset=2)

    # Input order is intentionally shuffled; build_tree must not reorder.
    tree = build_tree([second, root, first])

    assert [c.title for c in tree[0].children] == ["Second", "First"]


def test_build_tree_empty_input():
    assert build_tree([]) == []
