from typing import Annotated
from bson import ObjectId
from fastapi import Request, HTTPException, status, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from fastapi_backend.config import settings
from fastapi_backend.database import get_db
from fastapi_backend.auth.models import UserOut
from fastapi_backend.auth.service import decode_access_token


async def get_current_user(
    request: Request,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)]
) -> UserOut:
    token = request.cookies.get(settings.cookie_name)
    
    if not token:
        # Fallback to authorization header if needed
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    try:
        object_id = ObjectId(user_id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user id",
        )

    user_doc = await db.users.find_one({"_id": object_id})
    if not user_doc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    return UserOut.from_mongo(user_doc)

CurrentUserDep = Annotated[UserOut, Depends(get_current_user)]
