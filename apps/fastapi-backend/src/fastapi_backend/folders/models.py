from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator

from fastapi_backend.notes.models import NoteListItem, normalize_color


class FolderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    parent_folder_id: str | None = None
    color: str | None = None

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value: object) -> object:
        # Strip before validation so whitespace-only names are rejected
        # by min_length instead of being stored as empty strings.
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("color", mode="before")
    @classmethod
    def check_color(cls, value: object) -> object:
        return normalize_color(value)


class FolderUpdate(BaseModel):
    """Partial update — callers distinguish an omitted `parent_folder_id`
    ("don't move") from an explicit `null` ("move to root") via
    `model_fields_set`, because the plain `is not None` pattern used for
    other fields cannot express an intentional move to the workspace root.
    `color` follows the same semantics: omitted keeps it, explicit null
    clears the accent.
    """

    name: str | None = Field(default=None, min_length=1, max_length=200)
    parent_folder_id: str | None = None
    color: str | None = None

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("color", mode="before")
    @classmethod
    def check_color(cls, value: object) -> object:
        return normalize_color(value)


class FolderOut(BaseModel):
    """Folder shape for flat reads — folders are pure containers."""

    id: str
    parent_folder_id: str | None
    name: str
    order: int
    color: str | None = None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_mongo(cls, data: dict[str, Any]) -> "FolderOut":
        return cls(
            id=str(data["_id"]),
            parent_folder_id=(
                str(data["parent_folder_id"])
                if data.get("parent_folder_id") is not None
                else None
            ),
            name=data["name"],
            order=data.get("order", 0),
            color=data.get("color"),
            created_at=data["created_at"],
            updated_at=data["updated_at"],
        )


class FolderTreeItem(FolderOut):
    """A folder plus its nested folders and notes.

    Folders sort before notes at every level; each list is ordered by
    creation time.
    """

    folders: list["FolderTreeItem"] = Field(default_factory=list)
    notes: list[NoteListItem] = Field(default_factory=list)


class WorkspaceOut(BaseModel):
    """The combined folder/note tree for the sidebar.

    Root folders first, then root notes, each ordered by creation time.
    """

    folders: list[FolderTreeItem] = Field(default_factory=list)
    notes: list[NoteListItem] = Field(default_factory=list)
