"""Canonical event envelope for the transactional outbox.

This module defines the Pydantic model for the outbox document written to
MongoDB. The Go streamer reads these records and publishes a CLEAN envelope
(without internal control fields like ``status``, ``claimed_at``, etc.) to
Kafka. All field names are snake_case per the V3 contract.

Schema version 1 is the only version emitted by this phase.
``note.published`` is reserved and deliberately not emitted here (post-8).
"""

from datetime import datetime
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Valid event types for this phase
# ---------------------------------------------------------------------------

NoteEventType = Literal["note.changed", "note.deleted", "note.published"]


# ---------------------------------------------------------------------------
# Payload sub-model
# ---------------------------------------------------------------------------


class NoteEventPayload(BaseModel):
    """Payload embedded inside the outbox envelope.

    ``changed_fields`` carries the keys that changed (used by the search
    indexer to know which fields to re-fetch). For deletions, the list is
    empty — no fields were "changed", the note is gone.
    """

    changed_fields: list[str]
    updated_at: datetime


# ---------------------------------------------------------------------------
# Canonical outbox envelope
# ---------------------------------------------------------------------------


class NoteEvent(BaseModel):
    """Canonical outbox envelope — the shape written to ``event_outbox``.

    Control fields (``status``, ``attempts``, ``available_at``,
    ``claimed_at``, ``published_at``, ``failed_at``, ``error_reason``,
    ``created_at``) are NOT part of this model; they are appended when the
    record is inserted so that the Pydantic model stays clean and is easy
    to unit-test for shape/versioning.

    The Go streamer publishes only the fields declared here (event_id,
    event_type, schema_version, aggregate_type, aggregate_id, user_id,
    payload, created_at) — never the control fields.
    """

    event_id: str = Field(default_factory=lambda: str(uuid4()))
    event_type: NoteEventType
    schema_version: int = 1
    aggregate_type: str = "note"
    aggregate_id: str  # string repr of the note's ObjectId
    user_id: str  # string repr of the owner's ObjectId
    payload: NoteEventPayload
