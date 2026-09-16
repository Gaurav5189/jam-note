import pytest
from collections.abc import AsyncGenerator
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient
from motor.motor_asyncio import AsyncIOMotorDatabase

from fastapi_backend.main import app
from fastapi_backend.database import get_db


@pytest.fixture
def mock_db() -> AsyncIOMotorDatabase:
    client = AsyncMongoMockClient()
    db = client["test_jam_note"]
    return db


@pytest.fixture
async def client(mock_db: AsyncIOMotorDatabase) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db() -> AsyncIOMotorDatabase:
        return mock_db

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()
