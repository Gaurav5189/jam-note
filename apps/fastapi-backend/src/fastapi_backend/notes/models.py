from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

# A note is either a standard scrolling document or a spatial canvas board.
LayoutType = Literal["document", "canvas"]


class BlockProperties(BaseModel):
    """Known properties for built-in block types.

    `extra="allow"` mirrors the flexible block configuration described in
    DOCS/ARCHITECTURE.md — future block types may carry additional keys.
    """

    model_config = ConfigDict(extra="allow")

    text: str | None = None
    language: str | None = None
    checked: bool | None = None
    src: str | None = None


class CanvasMetadata(BaseModel):
    x: float = 0
    y: float = 0
    width: float = 0
    height: float = 0
    color: str | None = None


class Block(BaseModel):
    id: str
    type: str
    properties: BlockProperties = Field(default_factory=BlockProperties)
    canvas_metadata: CanvasMetadata | None = None


class BlockConnection(BaseModel):
    from_id: str
    to_id: str
    color: str | None = None


class NoteCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    parent_id: str | None = None
    layout_type: LayoutType = "document"
    emoji_icon: str | None = None
    blocks: list[Block] = Field(default_factory=list)
    block_connections: list[BlockConnection] = Field(default_factory=list)

    @field_validator("title", mode="before")
    @classmethod
    def strip_title(cls, value: object) -> object:
        # Strip before validation so whitespace-only titles are rejected
        # by min_length instead of being stored as empty strings.
        if isinstance(value, str):
            return value.strip()
        return value


class NoteUpdate(BaseModel):
    """Partial update — only provided fields are replaced.

    Delta/JSON-patch syncing arrives with the Phase 3 editor autosave
    state machine; Phase 2 replaces provided fields wholesale.
    """

    title: str | None = Field(default=None, min_length=1, max_length=200)
    layout_type: LayoutType | None = None
    emoji_icon: str | None = None
    blocks: list[Block] | None = None
    block_connections: list[BlockConnection] | None = None

    @field_validator("title", mode="before")
    @classmethod
    def strip_title(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value


class NoteListItem(BaseModel):
    """Lightweight note shape for sidebar/tree/search reads (no blocks)."""

    id: str
    parent_id: str | None
    title: str
    layout_type: LayoutType
    emoji_icon: str | None
    is_published: bool
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_mongo(cls, data: dict[str, Any]) -> "NoteListItem":
        return cls(
            id=str(data["_id"]),
            parent_id=str(data["parent_id"]) if data.get("parent_id") is not None else None,
            title=data["title"],
            layout_type=data.get("layout_type", "document"),
            emoji_icon=data.get("emoji_icon"),
            is_published=data.get("is_published", False),
            created_at=data["created_at"],
            updated_at=data["updated_at"],
        )


class NoteOut(NoteListItem):
    """Full note shape including block contents and canvas block connections."""

    blocks: list[Block] = Field(default_factory=list)
    block_connections: list[BlockConnection] = Field(default_factory=list)

    @classmethod
    def from_mongo(cls, data: dict[str, Any]) -> "NoteOut":
        return cls(
            id=str(data["_id"]),
            parent_id=str(data["parent_id"]) if data.get("parent_id") is not None else None,
            title=data["title"],
            layout_type=data.get("layout_type", "document"),
            emoji_icon=data.get("emoji_icon"),
            is_published=data.get("is_published", False),
            created_at=data["created_at"],
            updated_at=data["updated_at"],
            blocks=[Block.model_validate(block) for block in data.get("blocks", [])],
            block_connections=[
                BlockConnection.model_validate(conn)
                for conn in data.get("block_connections", [])
            ],
        )


class NoteTreeItem(NoteListItem):
    """A note plus its nested children, ordered by creation time."""

    children: list["NoteTreeItem"] = Field(default_factory=list)
