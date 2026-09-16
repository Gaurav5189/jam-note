from datetime import timedelta
import jwt
import pytest

from fastapi_backend.auth.service import (
    create_access_token,
    decode_access_token,
    get_password_hash,
    verify_password,
)
from fastapi_backend.config import settings


def test_password_hashing():
    password = "SuperSecretPassword123!"
    hashed = get_password_hash(password)
    
    assert hashed != password
    assert verify_password(password, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False


def test_create_and_decode_access_token():
    payload = {"sub": "user_id_12345", "role": "creator"}
    token = create_access_token(payload)

    decoded = decode_access_token(token)
    assert decoded is not None
    assert decoded["sub"] == "user_id_12345"
    assert decoded["role"] == "creator"
    assert "exp" in decoded


def test_decode_expired_access_token():
    payload = {"sub": "user_id_12345"}
    # Create token already expired
    token = create_access_token(payload, expires_delta=timedelta(seconds=-10))

    decoded = decode_access_token(token)
    assert decoded is None


def test_decode_invalid_signature():
    payload = {"sub": "user_id_12345"}
    # Encode with wrong 32-byte secret
    tampered_token = jwt.encode(payload, "wrong-secret-key-is-32-chars-long!", algorithm="HS256")

    decoded = decode_access_token(tampered_token)
    assert decoded is None
