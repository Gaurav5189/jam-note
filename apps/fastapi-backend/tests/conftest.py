import pytest
from collections.abc import AsyncGenerator
from httpx import ASGITransport, AsyncClient, Request
from mongomock_motor import AsyncMongoMockClient
from motor.motor_asyncio import AsyncIOMotorDatabase

from fastapi_backend.main import app
from fastapi_backend.database import get_db
from fastapi_backend.auth.rate_limit import RATE_LIMITS


@pytest.fixture(autouse=True)
def reset_rate_limits():
    """Clear in-memory rate limit buckets before every test so the
    shared test IP is never throttled by a previous test's requests."""
    for config in RATE_LIMITS.values():
        config.per_ip.clear()
        config.per_user.clear()
    yield
    for config in RATE_LIMITS.values():
        config.per_ip.clear()
        config.per_user.clear()


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
    ac = AsyncClient(transport=transport, base_url="http://test")

    # Mirror the browser fetchApi behaviour: read the csrf_token cookie
    # from the jar and send it as the X-CSRF-Token header on unsafe
    # methods. Login/signup set the cookie, so authenticated flows in
    # tests get the same double-submit treatment as production.
    async def add_csrf_header(request: Request) -> None:
        if request.method in ("POST", "PUT", "PATCH", "DELETE"):
            token = ac.cookies.get("csrf_token")
            if token:
                request.headers["X-CSRF-Token"] = token

    ac.event_hooks["request"].append(add_csrf_header)

    async with ac:
        yield ac

    app.dependency_overrides.clear()
