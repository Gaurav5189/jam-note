import asyncio
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from fastapi_backend.auth.dependencies import CurrentUserDep
from fastapi_backend.database import get_db

DbDep = Annotated[AsyncIOMotorDatabase, Depends(get_db)]
from fastapi_backend.notes import service as notes_service
from fastapi_backend.search import service as search_service
from fastapi_backend.search.client import get_opensearch_client
from fastapi_backend.search.schemas import SearchResponse, SearchResultItem

logger = logging.getLogger(__name__)

router = APIRouter(tags=["search"])


@router.get("/search", response_model=SearchResponse)
async def search(
    q: Annotated[str, Query(min_length=1, max_length=100)],
    current_user: CurrentUserDep,
    db: DbDep,
) -> SearchResponse:
    """Full-text search across note titles and block content with typo tolerance.

    If OpenSearch is reachable, returns ``{ "magic": true, "results": [...] }``.
    If OpenSearch is unavailable or times out, gracefully degrades to the
    existing title-regex MongoDB search and returns ``{ "magic": false, "results": [...] }``.
    """
    clean_q = q.strip()
    if not clean_q:
        return SearchResponse(magic=True, results=[])

    try:
        client = get_opensearch_client()
        # OpenSearch sync client is executed in a background worker thread
        # to avoid blocking the asyncio event loop.
        results = await asyncio.to_thread(
            search_service.search, client, clean_q, current_user.id
        )
        return SearchResponse(magic=True, results=results)
    except Exception as exc:
        try:
            err_msg = str(exc)
        except Exception:
            err_msg = repr(exc)
        logger.warning(
            "OpenSearch unavailable (%s: %s). Degrading gracefully to title regex search.",
            type(exc).__name__,
            err_msg,
        )
        fallback_notes = await notes_service.search_notes(db, current_user.id, clean_q)
        results = [
            SearchResultItem(
                note_id=str(doc["_id"]),
                block_id=None,
                note_title=doc.get("title", ""),
                snippet=doc.get("title", ""),
                rank=i,
            )
            for i, doc in enumerate(fallback_notes)
        ]
        return SearchResponse(magic=False, results=results)
