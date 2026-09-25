from unittest.mock import MagicMock, patch
from bson import ObjectId

from scripts.reindex import (
    generate_block_docs,
    is_text_bearing,
    reindex,
)


def test_is_text_bearing():
    assert is_text_bearing("text") is True
    assert is_text_bearing("header-1") is True
    assert is_text_bearing("header-2") is True
    assert is_text_bearing("header-3") is True
    assert is_text_bearing("todo") is True
    assert is_text_bearing("list-item") is True
    assert is_text_bearing("code") is True

    # Structural / empty blocks must be skipped
    assert is_text_bearing("divider") is False
    assert is_text_bearing("drawing") is False
    assert is_text_bearing("image") is False
    assert is_text_bearing("unknown-type") is False


def test_generate_block_docs_filters_and_formats():
    note = {
        "_id": ObjectId("507f1f77bcf86cd799439011"),
        "user_id": ObjectId("507f191e810c19729de860ea"),
        "title": "Full Stack Architecture",
        "blocks": [
            {"id": "b1", "type": "header-1", "properties": {"text": "Heading"}},
            {"id": "b2", "type": "divider", "properties": {}},
            {"id": "b3", "type": "text", "properties": {"text": "Body content"}},
            {"id": "b4", "type": "drawing", "properties": {"src": "data:image/png..."}},
            {"id": "b5", "type": "code", "properties": {"text": "print(1)"}},
        ],
    }

    docs = generate_block_docs(note, alias_name="notes-blocks")

    # Divider and drawing should be excluded
    assert len(docs) == 3

    assert docs[0]["_id"] == "507f1f77bcf86cd799439011:b1"
    assert docs[0]["_index"] == "notes-blocks"
    assert docs[0]["_source"]["block_order"] == 0
    assert docs[0]["_source"]["text"] == "Heading"
    assert docs[0]["_source"]["note_title"] == "Full Stack Architecture"
    assert docs[0]["_source"]["user_id"] == "507f191e810c19729de860ea"

    assert docs[1]["_id"] == "507f1f77bcf86cd799439011:b3"
    assert docs[1]["_source"]["block_order"] == 2
    assert docs[1]["_source"]["text"] == "Body content"

    assert docs[2]["_id"] == "507f1f77bcf86cd799439011:b5"
    assert docs[2]["_source"]["block_order"] == 4
    assert docs[2]["_source"]["text"] == "print(1)"


def test_reindex_flow_with_user_filter():
    mock_db = MagicMock()
    mock_os = MagicMock()
    mock_os.indices.exists.return_value = True
    mock_os.indices.exists_alias.return_value = True

    user_id = "507f191e810c19729de860ea"
    sample_notes = [
        {
            "_id": ObjectId("507f1f77bcf86cd799439011"),
            "user_id": ObjectId(user_id),
            "title": "User Note",
            "blocks": [
                {"id": "bk1", "type": "text", "properties": {"text": "Note content"}},
            ],
        }
    ]
    mock_db.notes.find.return_value = sample_notes

    with patch("scripts.reindex.helpers.bulk") as mock_bulk:
        result = reindex(
            mongo_db=mock_db,
            os_client=mock_os,
            user_id=user_id,
            fresh=False,
            alias_name="notes-blocks",
        )

        assert result["notes_count"] == 1
        assert result["blocks_count"] == 1
        assert result["user_id"] == user_id

        # Verify delete_by_query was called for this user
        mock_os.delete_by_query.assert_called_once_with(
            index="notes-blocks",
            body={"query": {"term": {"user_id": user_id}}},
            refresh=True,
        )

        # Verify bulk indexing was called
        mock_bulk.assert_called_once()
        bulk_docs = mock_bulk.call_args[0][1]
        assert len(bulk_docs) == 1
        assert bulk_docs[0]["_id"] == "507f1f77bcf86cd799439011:bk1"
