import pytest
from httpx import AsyncClient
from motor.motor_asyncio import AsyncIOMotorDatabase

from fastapi_backend.config import settings


@pytest.mark.asyncio
async def test_signup_success(client: AsyncClient, mock_db: AsyncIOMotorDatabase):
    signup_data = {
        "email": "producer@jamnote.dev",
        "username": "producer",
        "password": "ValidPassword123!",
        "display_name": "Studio Producer",
    }
    response = await client.post("/api/auth/signup", json=signup_data)
    assert response.status_code == 201
    
    data = response.json()
    assert data["email"] == "producer@jamnote.dev"
    assert data["username"] == "producer"
    assert data["profile"]["display_name"] == "Studio Producer"
    assert data["settings"]["theme"] == "dark-mono"
    assert "id" in data

    # Verify cookie was set
    assert settings.cookie_name in response.cookies

    # Verify stored in database
    user_in_db = await mock_db.users.find_one({"username": "producer"})
    assert user_in_db is not None
    assert user_in_db["password_hash"] != "ValidPassword123!"


@pytest.mark.asyncio
async def test_signup_duplicate_email(client: AsyncClient):
    signup_data = {
        "email": "duplicate@jamnote.dev",
        "username": "user1",
        "password": "ValidPassword123!",
    }
    res1 = await client.post("/api/auth/signup", json=signup_data)
    assert res1.status_code == 201

    signup_duplicate = {
        "email": "duplicate@jamnote.dev",
        "username": "user2",
        "password": "ValidPassword123!",
    }
    res2 = await client.post("/api/auth/signup", json=signup_duplicate)
    assert res2.status_code == 400
    assert "already registered" in res2.json()["detail"]


@pytest.mark.asyncio
async def test_signup_duplicate_username(client: AsyncClient):
    signup_data = {
        "email": "first@jamnote.dev",
        "username": "sameuser",
        "password": "ValidPassword123!",
    }
    res1 = await client.post("/api/auth/signup", json=signup_data)
    assert res1.status_code == 201

    signup_duplicate = {
        "email": "second@jamnote.dev",
        "username": "sameuser",
        "password": "ValidPassword123!",
    }
    res2 = await client.post("/api/auth/signup", json=signup_duplicate)
    assert res2.status_code == 400
    assert "already registered" in res2.json()["detail"]


@pytest.mark.asyncio
async def test_signup_validation_errors(client: AsyncClient):
    # Password too short (< 8 chars)
    short_pw = {
        "email": "short@jamnote.dev",
        "username": "shortpw",
        "password": "123",
    }
    res = await client.post("/api/auth/signup", json=short_pw)
    assert res.status_code == 422

    # Invalid email format
    invalid_email = {
        "email": "not-an-email",
        "username": "validname",
        "password": "ValidPassword123!",
    }
    res = await client.post("/api/auth/signup", json=invalid_email)
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_login_success_with_email(client: AsyncClient):
    # Register user first
    signup_data = {
        "email": "login_email@jamnote.dev",
        "username": "login_email_user",
        "password": "SecretPassword123!",
    }
    await client.post("/api/auth/signup", json=signup_data)

    # Login using email
    login_data = {
        "email_or_username": "login_email@jamnote.dev",
        "password": "SecretPassword123!",
    }
    response = await client.post("/api/auth/login", json=login_data)
    assert response.status_code == 200
    assert response.json()["username"] == "login_email_user"
    assert settings.cookie_name in response.cookies


@pytest.mark.asyncio
async def test_login_success_with_username(client: AsyncClient):
    # Register user first
    signup_data = {
        "email": "login_user@jamnote.dev",
        "username": "synthmaster",
        "password": "SecretPassword123!",
    }
    await client.post("/api/auth/signup", json=signup_data)

    # Login using username
    login_data = {
        "email_or_username": "synthmaster",
        "password": "SecretPassword123!",
    }
    response = await client.post("/api/auth/login", json=login_data)
    assert response.status_code == 200
    assert response.json()["email"] == "login_user@jamnote.dev"
    assert settings.cookie_name in response.cookies


@pytest.mark.asyncio
async def test_login_invalid_credentials(client: AsyncClient):
    signup_data = {
        "email": "valid_user@jamnote.dev",
        "username": "validuser",
        "password": "CorrectPassword123!",
    }
    await client.post("/api/auth/signup", json=signup_data)

    # Wrong password
    res = await client.post("/api/auth/login", json={
        "email_or_username": "validuser",
        "password": "WrongPassword123!",
    })
    assert res.status_code == 401
    assert "Incorrect username or password" in res.json()["detail"]

    # Non-existent user
    res = await client.post("/api/auth/login", json={
        "email_or_username": "ghost_user",
        "password": "CorrectPassword123!",
    })
    assert res.status_code == 401


@pytest.mark.asyncio
async def test_get_me_with_cookie(client: AsyncClient):
    # Sign up
    signup_data = {
        "email": "me_cookie@jamnote.dev",
        "username": "me_cookie_user",
        "password": "SecurePassword123!",
        "display_name": "Cookie Tester",
    }
    signup_res = await client.post("/api/auth/signup", json=signup_data)
    cookie_value = signup_res.cookies.get(settings.cookie_name)

    # Request /me with cookie
    client.cookies.set(settings.cookie_name, cookie_value)
    response = await client.get("/api/auth/me")
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "me_cookie_user"
    assert data["profile"]["display_name"] == "Cookie Tester"


@pytest.mark.asyncio
async def test_get_me_with_bearer_token(client: AsyncClient):
    signup_data = {
        "email": "me_bearer@jamnote.dev",
        "username": "me_bearer_user",
        "password": "SecurePassword123!",
    }
    signup_res = await client.post("/api/auth/signup", json=signup_data)
    token = signup_res.cookies.get(settings.cookie_name)

    # Make request with Authorization header
    response = await client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.json()["username"] == "me_bearer_user"


@pytest.mark.asyncio
async def test_get_me_unauthorized(client: AsyncClient):
    response = await client.get("/api/auth/me")
    assert response.status_code == 401
    assert "Not authenticated" in response.json()["detail"]


@pytest.mark.asyncio
async def test_logout(client: AsyncClient):
    signup_data = {
        "email": "logout_test@jamnote.dev",
        "username": "logout_user",
        "password": "SecurePassword123!",
    }
    signup_res = await client.post("/api/auth/signup", json=signup_data)
    cookie_value = signup_res.cookies.get(settings.cookie_name)
    client.cookies.set(settings.cookie_name, cookie_value)

    # Logout
    logout_res = await client.post("/api/auth/logout")
    assert logout_res.status_code == 200
    assert "Successfully logged out" in logout_res.json()["message"]
