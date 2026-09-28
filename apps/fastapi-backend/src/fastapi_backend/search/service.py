from typing import Any
from opensearchpy import OpenSearch

from fastapi_backend.config import settings
from fastapi_backend.search.schemas import SearchResultItem


def build_search_query(q: str, user_id: str, size: int = 50) -> dict[str, Any]:
    """Construct an OpenSearch multi-match query with fuzziness, highlights, and tenant isolation."""
    return {
        "query": {
            "bool": {
                "must": [
                    {
                        "multi_match": {
                            "query": q,
                            "fields": ["note_title^2", "text"],
                            "fuzziness": "AUTO",
                        }
                    }
                ],
                "filter": [
                    {
                        "term": {
                            "user_id": str(user_id),
                        }
                    }
                ],
            }
        },
        "highlight": {
            "fields": {
                "note_title": {},
                "text": {
                    "fragment_size": 150,
                    "number_of_fragments": 2,
                },
            }
        },
        "size": size,
    }


def parse_search_hits(hits: list[dict[str, Any]], query: str = "") -> list[SearchResultItem]:
    """Parse raw OpenSearch hits into SearchResultItem models.

    Matches are grouped so that note title hits appear first (deduplicated by note_id),
    followed by block content hits with snippets.
    """
    title_matches: list[SearchResultItem] = []
    content_matches: list[SearchResultItem] = []
    seen_title_note_ids: set[str] = set()

    q_lower = query.strip().lower()

    for hit in hits:
        source = hit.get("_source", {})
        highlight = hit.get("highlight", {})

        note_id = str(source.get("note_id", ""))
        block_id = str(source.get("block_id", ""))
        note_title = str(source.get("note_title", ""))
        raw_text = str(source.get("text", ""))

        has_title_highlight = "note_title" in highlight
        has_text_highlight = "text" in highlight

        # 1. Check for title match
        is_title_match = has_title_highlight or (
            not has_text_highlight and q_lower and q_lower in note_title.lower()
        )

        if is_title_match and note_id not in seen_title_note_ids:
            seen_title_note_ids.add(note_id)
            title_snippet = (
                highlight["note_title"][0] if has_title_highlight else note_title
            )
            title_matches.append(
                SearchResultItem(
                    note_id=note_id,
                    # Title hits open the note itself, never a block. The
                    # palette distinguishes title vs block matches via
                    # block_id — a block's id here would deep-link to an
                    # unrelated block and render the wrong row type.
                    block_id=None,
                    note_title=note_title,
                    snippet=title_snippet,
                    rank=0,  # Will be assigned after combining
                )
            )

        # 2. Check for content match
        is_content_match = has_text_highlight or (
            not is_title_match and bool(raw_text)
        )

        if is_content_match:
            if has_text_highlight:
                content_snippet = " ... ".join(highlight["text"])
            else:
                content_snippet = raw_text[:150]

            content_matches.append(
                SearchResultItem(
                    note_id=note_id,
                    block_id=block_id or None,
                    note_title=note_title,
                    snippet=content_snippet,
                    rank=0,  # Will be assigned after combining
                )
            )

    combined = title_matches + content_matches
    for i, item in enumerate(combined):
        item.rank = i

    return combined


def search(
    client: OpenSearch,
    q: str,
    user_id: str,
    alias: str | None = None,
    size: int = 50,
) -> list[SearchResultItem]:
    """Execute full-text search against OpenSearch with multi-tenant filtering."""
    target_alias = alias or settings.opensearch_alias
    body = build_search_query(q, user_id, size=size)

    response = client.search(index=target_alias, body=body)
    raw_hits = response.get("hits", {}).get("hits", [])
    return parse_search_hits(raw_hits, query=q)


def merge_mongo_title_hits(
    results: list[SearchResultItem], title_notes: list[dict[str, Any]]
) -> list[SearchResultItem]:
    """Fold MongoDB title matches into the magic-search results.

    The OpenSearch index holds one document per text-bearing block, so
    notes with no text-bearing blocks (fresh "Untitled" notes, image/
    drawing-only notes) can never match there — yet the pre-Phase-8 title
    search found them. Title-regex hits from MongoDB fill that gap.

    OpenSearch results win (deduplicated by note_id within the title
    section — they carry highlight snippets); merged hits are inserted
    after OpenSearch title hits and before the first block-content hit,
    then ranks are reassigned so title matches still lead.
    """
    if not title_notes:
        return results

    seen = {r.note_id for r in results if r.block_id is None}
    extras: list[SearchResultItem] = []
    for doc in title_notes:
        note_id = str(doc["_id"])
        if note_id in seen:
            continue
        seen.add(note_id)
        title = str(doc.get("title", ""))
        extras.append(
            SearchResultItem(
                note_id=note_id,
                block_id=None,
                note_title=title,
                snippet=title,
                rank=0,  # Will be assigned after combining
            )
        )
    if not extras:
        return results

    insert_at = next(
        (i for i, r in enumerate(results) if r.block_id is not None),
        len(results),
    )
    merged = results[:insert_at] + extras + results[insert_at:]
    for i, item in enumerate(merged):
        item.rank = i
    return merged
