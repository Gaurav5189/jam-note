"""Strict import models — the validation gauntlet's structural layer.

`extra="ignore"` everywhere: unknown fields are stripped, never
preserved (import_export_DESIGN §3). Mongo-level ids (`_id`, `user_id`,
`folder_id`) don't exist on these models at all — ownership is always
the importing user and placement is remapped by folder paths.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from fastapi_backend.notes.models import normalize_color

SUPPORTED_SCHEMA_VERSION = 1

# Roundtrip rule: an import must accept everything this app's write
# models can produce — folder names run to 200 chars there, so the
# import cap matches (a lower cap would lock users out of restoring
# their own backups).
MAX_NAME_CHARS = 200
MAX_TITLE_CHARS = 200
MAX_TEXT_CHARS = 50_000
MAX_LANGUAGE_CHARS = 50
MAX_EMOJI_CHARS = 16
MAX_BLOCK_ID_CHARS = 100
MAX_PATH_DEPTH = 20
MAX_BLOCKS_PER_NOTE = 2_000
MAX_CONNECTIONS_PER_NOTE = 2_000
MAX_NOTES_PER_IMPORT = 5_000
MAX_FOLDERS_PER_IMPORT = 5_000
MAX_HTTP_SRC_CHARS = 200_000
MAX_DATA_SRC_CHARS = 2_000_000
MAX_JSON_BYTES = 10 * 1024 * 1024
MAX_JSON_DEPTH = 50

# The block types this app can create or render read-only. Anything
# else in an import file is rejected rather than stored blind.
BLOCK_TYPE_WHITELIST = frozenset(
    {
        "text",
        "header-1",
        "header-2",
        "header-3",
        "todo",
        "list-item",
        "code",
        "divider",
        "drawing",
        "image",
        "canvas-node",
    }
)


def _validate_path(value: list[str]) -> list[str]:
    if len(value) > MAX_PATH_DEPTH:
        raise ValueError(f"folder path too deep — max {MAX_PATH_DEPTH} levels")
    for segment in value:
        if not isinstance(segment, str) or not segment.strip():
            raise ValueError("folder path segments must be non-empty strings")
        if len(segment) > MAX_NAME_CHARS:
            raise ValueError(
                f"folder path segments must be at most {MAX_NAME_CHARS} characters"
            )
    return value


class ImportBlockProperties(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text: str | None = Field(default=None, max_length=MAX_TEXT_CHARS)
    language: str | None = Field(default=None, max_length=MAX_LANGUAGE_CHARS)
    checked: bool | None = None
    src: str | None = Field(default=None, max_length=MAX_DATA_SRC_CHARS)


class ImportCanvasMetadata(BaseModel):
    model_config = ConfigDict(extra="ignore")

    # Sane finite ranges — rejects 1e18 coordinate bombs and inf.
    x: float = Field(default=0, ge=-1_000_000, le=1_000_000)
    y: float = Field(default=0, ge=-1_000_000, le=1_000_000)
    width: float = Field(default=0, ge=-1_000_000, le=1_000_000)
    height: float = Field(default=0, ge=-1_000_000, le=1_000_000)
    color: str | None = Field(default=None, max_length=32)


class ImportBlock(BaseModel):
    model_config = ConfigDict(extra="ignore")

    # Preserved when valid+unique so a roundtrip keeps identical blocks;
    # regenerated (with connections remapped) when absent/invalid/duped.
    id: str | None = Field(default=None, max_length=MAX_BLOCK_ID_CHARS)
    type: str
    properties: ImportBlockProperties = Field(default_factory=ImportBlockProperties)
    canvas_metadata: ImportCanvasMetadata | None = None

    @field_validator("type")
    @classmethod
    def check_type(cls, value: str) -> str:
        if value not in BLOCK_TYPE_WHITELIST:
            raise ValueError(
                f"Unsupported block type '{value}' — allowed: {sorted(BLOCK_TYPE_WHITELIST)}"
            )
        return value


class ImportBlockConnection(BaseModel):
    model_config = ConfigDict(extra="ignore")

    from_id: str = Field(max_length=MAX_BLOCK_ID_CHARS)
    to_id: str = Field(max_length=MAX_BLOCK_ID_CHARS)
    color: str | None = Field(default=None, max_length=32)


class ImportNote(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str = Field(min_length=1, max_length=MAX_TITLE_CHARS)
    path: list[str] = Field(default_factory=list)
    layout_type: Literal["document", "canvas"] = "document"
    emoji_icon: str | None = Field(default=None, max_length=MAX_EMOJI_CHARS)
    color: str | None = None
    blocks: list[ImportBlock] = Field(default_factory=list, max_length=MAX_BLOCKS_PER_NOTE)
    block_connections: list[ImportBlockConnection] = Field(
        default_factory=list, max_length=MAX_CONNECTIONS_PER_NOTE
    )
    # Original timestamps are honored for restore fidelity; absent → now.
    created_at: datetime | None = None
    updated_at: datetime | None = None

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

    @field_validator("path")
    @classmethod
    def check_path(cls, value: list[str]) -> list[str]:
        return _validate_path(value)


class ImportFolder(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str = Field(min_length=1, max_length=MAX_NAME_CHARS)
    path: list[str] = Field(default_factory=list)
    color: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

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

    @field_validator("path")
    @classmethod
    def check_path(cls, value: list[str]) -> list[str]:
        return _validate_path(value)


class ImportManifest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    schema_version: int
    exported_at: datetime | None = None
    folders: list[ImportFolder] = Field(
        default_factory=list, max_length=MAX_FOLDERS_PER_IMPORT
    )
    notes: list[ImportNote] = Field(
        default_factory=list, max_length=MAX_NOTES_PER_IMPORT
    )

    @field_validator("schema_version")
    @classmethod
    def check_schema_version(cls, value: int) -> int:
        if value != SUPPORTED_SCHEMA_VERSION:
            raise ValueError(
                "Unsupported schema version — the backup was exported from a "
                f"{'newer' if value > SUPPORTED_SCHEMA_VERSION else 'different'} "
                "jam-note and can't be restored here"
            )
        return value

    @model_validator(mode="after")
    def folder_paths_are_declared_or_shallow(self) -> "ImportManifest":
        # Every declared folder's own path must be resolvable from the
        # manifest's folder set alone — catches a manifest whose folders
        # dangle from undeclared ancestors.
        declared = {
            (*folder.path, folder.name) for folder in self.folders
        }
        for folder in self.folders:
            parent = tuple(folder.path)
            if parent and parent not in declared:
                raise ValueError(
                    f"folder '{folder.name}' path references undeclared parent "
                    f"'{' / '.join(folder.path)}'"
                )
        return self


class ImportPreviewOut(BaseModel):
    folders: int
    notes: int
    size_bytes: int
    message: str


class ImportCommitOut(BaseModel):
    folders: int
    notes: int
    message: str
