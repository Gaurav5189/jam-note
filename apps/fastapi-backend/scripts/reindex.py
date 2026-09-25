#!/usr/bin/env python3
"""Idempotent backfill script to index all active MongoDB note blocks into OpenSearch.

Usage:
    python scripts/reindex.py
    python scripts/reindex.py --user <user_id>
    python scripts/reindex.py --fresh
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from bson import ObjectId
from opensearchpy import OpenSearch, helpers
from pymongo import MongoClient

# Ensure fastapi_backend can be imported if running directly
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

try:
    from fastapi_backend.config import settings
except ImportError:
    settings = None

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(levelname)s: %(message)s")
logger = logging.getLogger("reindex")

TEXT_BEARING_BLOCK_TYPES = frozenset(
    {"text", "header-1", "header-2", "header-3", "todo", "list-item", "code"}
)

DEFAULT_EMBEDDED_SCHEMA: dict[str, Any] = {
    "settings": {
        "index": {
            "number_of_shards": 1,
            "number_of_replicas": 1,
        },
        "analysis": {
            "analyzer": {
                "autocomplete": {
                    "type": "custom",
                    "tokenizer": "standard",
                    "filter": ["lowercase", "autocomplete_filter"],
                }
            },
            "filter": {
                "autocomplete_filter": {
                    "type": "edge_ngram",
                    "min_gram": 1,
                    "max_gram": 20,
                }
            },
        },
    },
    "mappings": {
        "properties": {
            "user_id": {"type": "keyword"},
            "note_id": {"type": "keyword"},
            "block_id": {"type": "keyword"},
            "note_title": {
                "type": "text",
                "fields": {
                    "autocomplete": {
                        "type": "text",
                        "analyzer": "autocomplete",
                    }
                },
            },
            "block_order": {"type": "integer"},
            "text": {"type": "text"},
            "updated_at": {"type": "date"},
        }
    },
    "aliases": {
        "notes-blocks": {},
    },
}


def is_text_bearing(block_type: str) -> bool:
    """Return True if block_type carries searchable text."""
    return block_type in TEXT_BEARING_BLOCK_TYPES


def load_index_schema() -> dict[str, Any]:
    """Load canonical schema JSON from search-indexer, falling back to embedded schema."""
    schema_path = (
        Path(__file__).resolve().parent.parent.parent
        / "search-indexer"
        / "schema"
        / "notes_blocks_schema.json"
    )
    if schema_path.exists():
        try:
            with open(schema_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as exc:
            logger.warning("Could not read %s (%s); using embedded schema fallback", schema_path, exc)
    return DEFAULT_EMBEDDED_SCHEMA


def ensure_index(client: OpenSearch, index_name: str, alias_name: str) -> None:
    """Verify that the target index and alias exist, creating them if necessary."""
    if not client.indices.exists(index=index_name):
        schema = load_index_schema()
        schema["aliases"] = {alias_name: {}}
        client.indices.create(index=index_name, body=schema)
        logger.info("Created OpenSearch index '%s' with alias '%s'", index_name, alias_name)
    else:
        if not client.indices.exists_alias(name=alias_name, index=index_name):
            client.indices.put_alias(index=index_name, name=alias_name)
            logger.info("Added alias '%s' to existing index '%s'", alias_name, index_name)


def generate_block_docs(note: dict[str, Any], alias_name: str) -> list[dict[str, Any]]:
    """Build OpenSearch bulk-action documents for all text-bearing blocks in a note."""
    docs: list[dict[str, Any]] = []
    note_id = str(note["_id"])
    user_id = str(note.get("user_id", ""))
    note_title = str(note.get("title", ""))

    updated_at = note.get("updated_at")
    if isinstance(updated_at, datetime):
        updated_at_iso = updated_at.isoformat()
    elif updated_at:
        updated_at_iso = str(updated_at)
    else:
        updated_at_iso = datetime.now(timezone.utc).isoformat()

    blocks = note.get("blocks", [])
    for idx, block in enumerate(blocks):
        b_type = block.get("type", "")
        if not is_text_bearing(b_type):
            continue

        b_id = str(block.get("id", ""))
        props = block.get("properties", {}) or {}
        text = str(props.get("text", "") or "")

        doc_id = f"{note_id}:{b_id}"
        docs.append(
            {
                "_index": alias_name,
                "_id": doc_id,
                "_source": {
                    "user_id": user_id,
                    "note_id": note_id,
                    "block_id": b_id,
                    "note_title": note_title,
                    "block_order": idx,
                    "text": text,
                    "updated_at": updated_at_iso,
                },
            }
        )
    return docs


def reindex(
    mongo_db: Any,
    os_client: OpenSearch,
    user_id: str | None = None,
    fresh: bool = False,
    index_name: str = "notes-blocks-v1",
    alias_name: str = "notes-blocks",
) -> dict[str, Any]:
    """Execute backfill of active note blocks from MongoDB to OpenSearch."""
    ensure_index(os_client, index_name, alias_name)

    # 1. Clean existing index documents if needed
    if user_id:
        logger.info("Purging existing blocks for user %s from '%s'", user_id, alias_name)
        try:
            os_client.delete_by_query(
                index=alias_name,
                body={"query": {"term": {"user_id": str(user_id)}}},
                refresh=True,
            )
        except Exception as exc:
            logger.warning("delete_by_query for user %s: %s", user_id, exc)
    elif fresh:
        logger.info("Performing fresh reindex: deleting all documents from '%s'", alias_name)
        try:
            os_client.delete_by_query(
                index=alias_name,
                body={"query": {"match_all": {}}},
                refresh=True,
            )
        except Exception as exc:
            logger.warning("delete_by_query match_all: %s", exc)

    # 2. Build MongoDB query
    mongo_filter: dict[str, Any] = {"deleted_at": None}
    if user_id:
        try:
            user_oid = ObjectId(user_id)
            mongo_filter["$or"] = [{"user_id": user_oid}, {"user_id": str(user_id)}]
        except Exception:
            mongo_filter["user_id"] = str(user_id)

    cursor = mongo_db.notes.find(mongo_filter)

    # 3. Stream notes and bulk-index blocks
    actions: list[dict[str, Any]] = []
    total_notes = 0
    total_blocks = 0
    batch_size = 500

    for note in cursor:
        total_notes += 1
        docs = generate_block_docs(note, alias_name)
        actions.extend(docs)
        total_blocks += len(docs)

        if len(actions) >= batch_size:
            helpers.bulk(os_client, list(actions), stats_only=True)
            actions.clear()

    if actions:
        helpers.bulk(os_client, list(actions), stats_only=True)
        actions.clear()

    logger.info(
        "Reindexing complete: %d text-bearing blocks indexed across %d notes (user: %s)",
        total_blocks,
        total_notes,
        user_id or "all",
    )
    return {
        "notes_count": total_notes,
        "blocks_count": total_blocks,
        "user_id": user_id,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill MongoDB notes into OpenSearch")
    parser.add_argument(
        "--user",
        type=str,
        default=None,
        help="Optional user ID to reindex only a single user's notes",
    )
    parser.add_argument(
        "--fresh",
        action="store_true",
        help="Purge all existing documents from the search alias before indexing",
    )
    args = parser.parse_args()

    mongo_url = os.getenv("MONGODB_URL", settings.mongodb_url if settings else "mongodb://localhost:27017")
    db_name = os.getenv("DATABASE_NAME", settings.database_name if settings else "jam_note")
    os_url = os.getenv("OPENSEARCH_URL", settings.opensearch_url if settings else "http://localhost:9200")
    os_index = os.getenv("OPENSEARCH_INDEX", settings.opensearch_index if settings else "notes-blocks-v1")
    os_alias = os.getenv("OPENSEARCH_ALIAS", settings.opensearch_alias if settings else "notes-blocks")

    logger.info("Connecting to MongoDB at %s (db: %s)", mongo_url, db_name)
    mongo_client = MongoClient(mongo_url)
    db = mongo_client[db_name]

    logger.info("Connecting to OpenSearch at %s", os_url)
    os_client = OpenSearch(
        hosts=[os_url],
        verify_certs=True,
        timeout=30,
        max_retries=3,
        retry_on_timeout=True,
    )

    reindex(
        mongo_db=db,
        os_client=os_client,
        user_id=args.user,
        fresh=args.fresh,
        index_name=os_index,
        alias_name=os_alias,
    )


if __name__ == "__main__":
    main()
