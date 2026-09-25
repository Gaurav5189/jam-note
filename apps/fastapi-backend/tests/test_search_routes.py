from unittest.mock import MagicMock
import pytest
from httpx import AsyncClient
from opensearchpy.exceptions import ConnectionError as OSConnectionError

from fastapi_backend.config import settings
from fastapi_backend.search.client import override_opensearch_client


async def signup_and_authenticate(client: AsyncClient, username: str) -> None:
    response = await client.post(
        "/api/auth/signup",
        json={
            "email": f"{username}@jamnote.dev",
            "username": username,
            "password": "SecurePassword123!",
        },
    )
    assert response.status_code == 201
    cookie_value = response.cookies.get(settings.cookie_name)
    assert cookie_value
    client.cookies.set(settings.cookie_name, cookie_value)


@pytest.mark.asyncio
async def test_search_unauthenticated(client: AsyncClient):
    response = await client.get("/api/search?q=test")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_search_magic_success(client: AsyncClient):
    await signup_and_authenticate(client, "search_user_1")

    # Mock OpenSearch client
    mock_os = MagicMock()
    mock_os.search.return_value = {
        "hits": {
            "hits": [
                {
                    "_source": {
                        "note_id": "note-99",
                        "block_id": "b-1",
                        "note_title": "Postgres vs Mongo",
                        "text": "MongoDB handles document structures naturally.",
                    },
                    "highlight": {
                        "text": ["<em>MongoDB</em> handles document structures naturally."],
                    },
                }
            ]
        }
    }
    override_opensearch_client(mock_os)
    try:
        response = await client.get("/api/search?q=mongodb")
        assert response.status_code == 200
        data = response.json()

        assert data["magic"] is True
        assert len(data["results"]) == 1
        result = data["results"][0]
        assert result["note_id"] == "note-99"
        assert result["block_id"] == "b-1"
        assert result["note_title"] == "Postgres vs Mongo"
        assert result["snippet"] == "<em>MongoDB</em> handles document structures naturally."
        assert result["rank"] == 0
    finally:
        override_opensearch_client(None)


@pytest.mark.asyncio
async def test_search_graceful_degradation_fallback(client: AsyncClient):
    await signup_and_authenticate(client, "degrade_user")

    # Create a note in MongoDB so title-regex fallback can find it
    create_resp = await client.post(
        "/api/notes",
        json={"title": "Local Machine Learning Notes"},
    )
    assert create_resp.status_code == 201
    created_note = create_resp.json()

    # Simulate OpenSearch connection failure
    mock_os = MagicMock()
    mock_os.search.side_effect = OSConnectionError("N/A", "Connection refused", {})
    override_opensearch_client(mock_os)

    try:
        response = await client.get("/api/search?q=Machine")
        assert response.status_code == 200
        data = response.json()

        # Magic search is OFFLINE -> degraded to title regex
        assert data["magic"] is False
        assert len(data["results"]) == 1
        res = data["results"][0]
        assert res["note_id"] == created_note["id"]
        assert res["note_title"] == "Local Machine Learning Notes"
        assert res["snippet"] == "Local Machine Learning Notes"
        assert res["block_id"] is None
        assert res["rank"] == 0
    finally:
        override_opensearch_client(None)


@pytest.mark.asyncio
async def test_search_empty_query_returns_empty(client: AsyncClient):
    await signup_and_authenticate(client, "empty_q_user")
    response = await client.get("/api/search?q=   ")
    assert response.status_code == 200
    data = response.json()
    assert data["magic"] is True
    assert data["results"] == []
