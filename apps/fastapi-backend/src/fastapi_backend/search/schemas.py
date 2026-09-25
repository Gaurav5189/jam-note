from pydantic import BaseModel


class SearchResultItem(BaseModel):
    """Individual search match (either a title hit or a block content snippet)."""

    note_id: str
    block_id: str | None = None
    note_title: str
    snippet: str
    rank: int


class SearchResponse(BaseModel):
    """Unified search response envelope.

    ``magic`` is True when OpenSearch served the query, or False when
    OpenSearch was unreachable and results were gracefully degraded to
    MongoDB title-regex search.
    """

    magic: bool
    results: list[SearchResultItem]
