"""Transactional outbox writer helpers.

FastAPI's write contract (OUTBOX_STREAMER_IMPLEMENTATION_PLAN_V3.md §5):
  - Every note mutation writes the business change AND the outbox event in
    ONE MongoDB transaction when Atlas / a replica set is available.
  - On standalone/mongomock (unit tests) transactions are unavailable; the
    fallback executes both writes sequentially and is still functionally
    correct for tests (no Kafka involved at all).

Key design decisions:
  - No Kafka dependencies here — the Go streamer owns Kafka entirely.
  - ``_transactions_supported`` is imported from the importing module to
    reuse the existing ``hello`` topology probe (single source of truth).
  - ``record_note_event`` builds the complete outbox document dict. Callers
    pass a live Motor session when inside a transaction; ``None`` is safe for
    the non-transactional fallback path.
  - ``transaction_or_fallback`` is an async context manager that either opens
    a real transaction or yields ``None`` (no session) for the fallback path.
"""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClientSession, AsyncIOMotorDatabase

from fastapi_backend.events.schemas import NoteEvent, NoteEventType

logger = logging.getLogger(__name__)


async def _transactions_supported(db: AsyncIOMotorDatabase) -> bool:
    """Real Mongo topology check: transactions need a replica set or mongos.

    Inlined here (rather than imported from importing.service) to avoid a
    circular import: notes.service → events.outbox → importing.service →
    events.outbox.
    """
    try:
        hello = await db.command("hello")
    except Exception:
        return False
    if not isinstance(hello, dict):
        return False
    return bool(hello.get("setName")) or hello.get("msg") == "isdbgrid"




def utc_now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Outbox document builder
# ---------------------------------------------------------------------------


def _build_outbox_doc(event: NoteEvent) -> dict[str, Any]:
    """Construct the full outbox document dict from a NoteEvent.

    Control fields (status, attempts, available_at, claimed_at, published_at,
    failed_at, error_reason) are appended here. The ``created_at`` timestamp
    is shared with ``available_at`` — new events are immediately available
    for pickup.
    """
    now = utc_now()
    return {
        "event_id": event.event_id,
        "event_type": event.event_type,
        "schema_version": event.schema_version,
        "aggregate_type": event.aggregate_type,
        "aggregate_id": event.aggregate_id,
        "user_id": event.user_id,
        "payload": {
            "changed_fields": event.payload.changed_fields,
            "updated_at": event.payload.updated_at,
        },
        # Control fields (never published to Kafka):
        "status": "pending",
        "attempts": 0,
        "available_at": now,
        "claimed_at": None,
        "published_at": None,
        "failed_at": None,
        "error_reason": None,
        "created_at": now,
    }


# ---------------------------------------------------------------------------
# Primary helper: record a note event into the outbox
# ---------------------------------------------------------------------------


async def record_note_event(
    db: AsyncIOMotorDatabase,
    *,
    event_type: NoteEventType,
    note_id: ObjectId,
    user_id: ObjectId,
    changed_fields: list[str],
    updated_at: datetime,
    session: AsyncIOMotorClientSession | None = None,
) -> None:
    """Insert one outbox record inside the provided session (or without one).

    ``session=None`` is the non-transactional fallback used by mongomock
    and standalone dev setups. Motor's ``insert_one`` silently ignores
    ``session=None`` when passed as a kwarg — we must omit it entirely,
    which is why we use the ``_session_kwargs`` pattern from the importing
    module.
    """
    event = NoteEvent(
        event_type=event_type,
        aggregate_id=str(note_id),
        user_id=str(user_id),
        payload={
            "changed_fields": changed_fields,
            "updated_at": updated_at,
        },
    )
    doc = _build_outbox_doc(event)
    kwargs: dict[str, Any] = {}
    if session is not None:
        kwargs["session"] = session
    await db.event_outbox.insert_one(doc, **kwargs)


# ---------------------------------------------------------------------------
# Context manager: transaction when supported, plain fallback otherwise
# ---------------------------------------------------------------------------


@asynccontextmanager
async def transaction_or_fallback(
    db: AsyncIOMotorDatabase,
) -> AsyncGenerator[AsyncIOMotorClientSession | None, None]:
    """Async context manager that provides a transactional session when the
    MongoDB topology supports transactions (replica set / mongos), or yields
    ``None`` for standalone / mongomock environments.

    Usage::

        async with transaction_or_fallback(db) as session:
            # write business mutation + outbox in the same session
            await db.notes.update_one({...}, {\"$set\": ...}, session=session)
            await record_note_event(db, ..., session=session)

    When ``session`` is ``None`` the caller's writes run outside a
    transaction. This is the correct path for unit tests using mongomock.
    """
    if not await _transactions_supported(db):
        # Non-transactional fallback — mongomock, standalone dev server.
        yield None
        return

    try:
        session = await db.client.start_session()
    except Exception:
        logger.warning(
            "Could not open a Motor session; falling back to non-transactional writes."
        )
        yield None
        return

    try:
        async with session:
            async with session.start_transaction():
                yield session
    except Exception:
        raise
