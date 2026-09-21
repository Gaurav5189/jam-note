from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

# A note is either a standard scrolling document or a spatial canvas board.
LayoutType = Literal["document", "canvas"]

# Pastel accents available to folders and notes in the sidebar (Phase 6
# color coding). Stored as a palette key, never a raw color string, so
# the API can validate it and the frontend owns the actual hues. Shared
# by the notes and folders models (folders import from here).
PALETTE_COLORS = frozenset(
    {"amber", "rose", "mint", "sky", "violet", "lime", "peach", "steel"}
)


def normalize_color(value: object) -> object:
    """Palette validator body: strip + lowercase, reject unknown keys.

    `None` passes through untouched (no accent). Raising ValueError here
    surfaces as the usual 422 validation error.
    """
    if value is None or isinstance(value, str) and value.strip() == "":
        return None
    if isinstance(value, str):
        key = value.strip().lower()
        if key in PALETTE_COLORS:
            return key
    raise ValueError(f"color must be one of {sorted(PALETTE_COLORS)}")


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
    folder_id: str | None = None
    layout_type: LayoutType = "document"
    emoji_icon: str | None = None
    color: str | None = None
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

    @field_validator("color", mode="before")
    @classmethod
    def check_color(cls, value: object) -> object:
        return normalize_color(value)


class NoteUpdate(BaseModel):
    """Partial update — only provided fields are replaced.

    `folder_id` and `color` use `model_fields_set` semantics: omitted
    means "don't touch", explicit null means "clear the accent".
    """

    title: str | None = Field(default=None, min_length=1, max_length=200)
    folder_id: str | None = None
    layout_type: LayoutType | None = None
    emoji_icon: str | None = None
    color: str | None = None
    blocks: list[Block] | None = None
    block_connections: list[BlockConnection] | None = None

    @field_validator("title", mode="before")
    @classmethod
    def strip_title(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("color", mode="before")
    @classmethod
    def check_color(cls, value: object) -> object:
        return normalize_color(value)


class NoteListItem(BaseModel):
    """Lightweight note shape for sidebar/tree/search reads (no blocks)."""

    id: str
    folder_id: str | None
    title: str
    layout_type: LayoutType
    emoji_icon: str | None
    color: str | None = None
    is_published: bool
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_mongo(cls, data: dict[str, Any]) -> "NoteListItem":
        return cls(
            id=str(data["_id"]),
            # get(): documents created before folders existed (or wiped
            # without one) simply read as root notes.
            folder_id=str(data["folder_id"]) if data.get("folder_id") is not None else None,
            title=data["title"],
            layout_type=data.get("layout_type", "document"),
            emoji_icon=data.get("emoji_icon"),
            color=data.get("color"),
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
            folder_id=str(data["folder_id"]) if data.get("folder_id") is not None else None,
            title=data["title"],
            layout_type=data.get("layout_type", "document"),
            emoji_icon=data.get("emoji_icon"),
            color=data.get("color"),
            is_published=data.get("is_published", False),
            created_at=data["created_at"],
            updated_at=data["updated_at"],
            blocks=[Block.model_validate(block) for block in data.get("blocks", [])],
            block_connections=[
                BlockConnection.model_validate(conn)
                for conn in data.get("block_connections", [])
            ],
        )
