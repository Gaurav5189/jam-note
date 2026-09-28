from unittest.mock import MagicMock

from fastapi_backend.search.schemas import SearchResultItem
from fastapi_backend.search.service import (
    build_search_query,
    merge_mongo_title_hits,
    parse_search_hits,
    search,
)


def test_build_search_query():
    query = build_search_query("docker compose", "user-123", size=25)

    assert "query" in query
    bool_q = query["query"]["bool"]
    must = bool_q["must"][0]["multi_match"]

    assert must["query"] == "docker compose"
    assert "note_title^2" in must["fields"]
    assert "text" in must["fields"]
    assert must["fuzziness"] == "AUTO"

    filters = bool_q["filter"]
    assert filters[0]["term"]["user_id"] == "user-123"

    assert "highlight" in query
    assert "note_title" in query["highlight"]["fields"]
    assert "text" in query["highlight"]["fields"]
    assert query["size"] == 25


def test_parse_search_hits_ranking_and_deduplication():
    raw_hits = [
        # Hit 1: content match on note 1 block b1
        {
            "_source": {
                "note_id": "note-1",
                "block_id": "b1",
                "note_title": "Architecture Overview",
                "text": "We deploy using Docker Swarm and Kubernetes.",
            },
            "highlight": {
                "text": ["We deploy using <em>Docker</em> Swarm."],
            },
        },
        # Hit 2: title match on note 2 block b10
        {
            "_source": {
                "note_id": "note-2",
                "block_id": "b10",
                "note_title": "Docker Setup Guide",
                "text": "Install steps...",
            },
            "highlight": {
                "note_title": ["<em>Docker</em> Setup Guide"],
            },
        },
        # Hit 3: another block in note 2 with title match
        {
            "_source": {
                "note_id": "note-2",
                "block_id": "b11",
                "note_title": "Docker Setup Guide",
                "text": "Configuration steps...",
            },
            "highlight": {
                "note_title": ["<em>Docker</em> Setup Guide"],
            },
        },
        # Hit 4: content match on note 1 block b2
        {
            "_source": {
                "note_id": "note-1",
                "block_id": "b2",
                "note_title": "Architecture Overview",
                "text": "Docker containers run isolated.",
            },
            "highlight": {
                "text": ["<em>Docker</em> containers run isolated."],
            },
        },
    ]

    results = parse_search_hits(raw_hits, query="docker")

    # 1. Title match on note-2 should be grouped first
    assert len(results) == 3  # note-2 title (deduped), note-1 b1 content, note-1 b2 content

    assert results[0].note_id == "note-2"
    assert results[0].note_title == "Docker Setup Guide"
    assert results[0].snippet == "<em>Docker</em> Setup Guide"
    assert results[0].block_id is None  # title hits open the note, not a block
    assert results[0].rank == 0

    # 2. Content matches follow
    assert results[1].note_id == "note-1"
    assert results[1].block_id == "b1"
    assert results[1].snippet == "We deploy using <em>Docker</em> Swarm."
    assert results[1].rank == 1

    assert results[2].note_id == "note-1"
    assert results[2].block_id == "b2"
    assert results[2].snippet == "<em>Docker</em> containers run isolated."
    assert results[2].rank == 2


def test_parse_search_hits_fuzzy_without_highlights():
    raw_hits = [
        {
            "_source": {
                "note_id": "note-fuzzy",
                "block_id": "bf",
                "note_title": "Kubernetes Cluster",
                "text": "Some text about k8s deployments.",
            },
            # No highlight returned by OpenSearch due to high fuzziness
            "highlight": {},
        }
    ]

    results = parse_search_hits(raw_hits, query="kubernetes")
    assert len(results) == 1
    assert results[0].note_id == "note-fuzzy"
    assert results[0].snippet == "Kubernetes Cluster"
    assert results[0].rank == 0


def test_search_executes_against_client():
    mock_client = MagicMock()
    mock_client.search.return_value = {
        "hits": {
            "hits": [
                {
                    "_source": {
                        "note_id": "n1",
                        "block_id": "b1",
                        "note_title": "My Note",
                        "text": "Content",
                    },
                    "highlight": {"text": ["<em>Content</em>"]},
                }
            ]
        }
    }

    results = search(mock_client, q="content", user_id="u123", alias="test-alias")

    assert len(results) == 1
    assert results[0].note_id == "n1"
    assert results[0].block_id == "b1"
    assert results[0].snippet == "<em>Content</em>"

    mock_client.search.assert_called_once()
    call_args = mock_client.search.call_args
    assert call_args.kwargs["index"] == "test-alias"
    assert call_args.kwargs["body"]["query"]["bool"]["filter"][0]["term"]["user_id"] == "u123"


def test_merge_mongo_title_hits_dedupe_and_ranking():
    os_results = [
        # OpenSearch title hit (block_id None) — must win over the Mongo hit
        SearchResultItem(note_id="n1", block_id=None, note_title="Alpha", snippet="<em>al</em>pha", rank=0),
        # OpenSearch content hit for another note
        SearchResultItem(note_id="n2", block_id="b2", note_title="Beta", snippet="beta content", rank=1),
    ]
    title_notes = [
        {"_id": "n1", "title": "Alpha"},  # duplicate of the OS title hit — dropped
        {"_id": "n3", "title": "Gamma"},  # blockless note — merged
        {"_id": "n2", "title": "Beta"},  # note already present as a content hit — also kept as a title hit
    ]

    merged = merge_mongo_title_hits(os_results, title_notes)

    # Title section first (OS title hit, then merged title hits), content last.
    assert [r.note_id for r in merged] == ["n1", "n3", "n2", "n2"]
    assert merged[0].block_id is None
    assert merged[1].block_id is None
    assert merged[1].note_title == "Gamma"
    assert merged[2].block_id is None  # the merged title entry for n2
    assert merged[3].block_id == "b2"  # the original OS content entry
    assert [r.rank for r in merged] == [0, 1, 2, 3]


def test_merge_mongo_title_hits_noop_without_extras():
    os_results = [
        SearchResultItem(note_id="n1", block_id=None, note_title="Alpha", snippet="Alpha", rank=0),
        SearchResultItem(note_id="n2", block_id="b2", note_title="Beta", snippet="beta", rank=1),
    ]

    # All Mongo hits are duplicates — results returned unchanged.
    assert merge_mongo_title_hits(os_results, [{"_id": "n1", "title": "Alpha"}]) is os_results
    assert merge_mongo_title_hits(os_results, []) is os_results
