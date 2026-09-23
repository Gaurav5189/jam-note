from datetime import datetime, timezone
from typing import Annotated

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Response, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from fastapi_backend.config import settings
from fastapi_backend.database import get_db
from fastapi_backend.auth.models import (
    MessageResponse,
    PasswordUpdate,
    UserLogin,
    UserOut,
    UserSignUp,
    UserUpdateMe,
)
from fastapi_backend.auth.service import (
    create_access_token,
    get_password_hash,
    verify_password,
)
from fastapi_backend.auth.dependencies import CurrentUserDep

router = APIRouter(
    prefix="/auth",
    tags=["auth"],
)


@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(
    user_data: UserSignUp,
    response: Response,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)]
) -> UserOut:
    # Check if email or username already exists
    existing_user = await db.users.find_one({
        "$or": [{"email": user_data.email}, {"username": user_data.username}]
    })
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email or username already registered"
        )

    now = datetime.now(timezone.utc)
    new_user = {
        "email": user_data.email,
        "username": user_data.username,
        "password_hash": get_password_hash(user_data.password),
        "profile": {
            "display_name": user_data.display_name or user_data.username,
            "avatar_url": None,
        },
        "settings": {
            "theme": "dark-mono",
            "editor_preferences": {
                "default_layout": "document",
                "font_family": "Inter",
                "font_size": 14
            }
        },
        "created_at": now,
        "updated_at": now,
    }

    result = await db.users.insert_one(new_user)
    
    # Authenticate immediately
    token = create_access_token(data={"sub": str(result.inserted_id)})
    
    response.set_cookie(
        key=settings.cookie_name,
        value=token,
        httponly=True,
        max_age=settings.jwt_expire_minutes * 60,
        samesite="lax",
    )
    
    user_doc = await db.users.find_one({"_id": result.inserted_id})
    if not user_doc:
         raise HTTPException(status_code=500, detail="User creation failed")
         
    return UserOut.from_mongo(user_doc)


@router.post("/login")
async def login(
    user_data: UserLogin,
    response: Response,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)]
) -> UserOut:
    user_doc = await db.users.find_one({
        "$or": [{"email": user_data.email_or_username}, {"username": user_data.email_or_username}]
    })
    
    if not user_doc or not verify_password(user_data.password, user_doc["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )

    token = create_access_token(data={"sub": str(user_doc["_id"])})
    
    response.set_cookie(
        key=settings.cookie_name,
        value=token,
        httponly=True,
        max_age=settings.jwt_expire_minutes * 60,
        samesite="lax",
    )
    
    return UserOut.from_mongo(user_doc)


@router.post("/logout")
async def logout(response: Response) -> MessageResponse:
    response.delete_cookie(key=settings.cookie_name)
    return MessageResponse(message="Successfully logged out")


@router.get("/me")
async def get_me(current_user: CurrentUserDep) -> UserOut:
    return current_user


@router.patch("/me")
async def update_me(
    update_data: UserUpdateMe,
    current_user: CurrentUserDep,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
) -> UserOut:
    """Profile identity card — update the display name."""
    now = datetime.now(timezone.utc)
    result = await db.users.update_one(
        {"_id": ObjectId(current_user.id)},
        {
            "$set": {
                "profile.display_name": update_data.display_name,
                "updated_at": now,
            }
        },
    )
    if result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User update failed",
        )
    user_doc = await db.users.find_one({"_id": ObjectId(current_user.id)})
    if not user_doc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User update failed",
        )
    return UserOut.from_mongo(user_doc)


@router.put("/password")
async def update_password(
    password_data: PasswordUpdate,
    current_user: CurrentUserDep,
    db: Annotated[AsyncIOMotorDatabase, Depends(get_db)],
) -> MessageResponse:
    """Profile security form — rotate the password.

    The current password is verified against the stored hash first —
    an unattended browser or a hijacked session cookie must not be
    enough to take the credential over. The stateless session cookie
    stays valid (no session revoke — noted as deferred scope); users
    log in with the new password next time.
    """
    user_doc = await db.users.find_one(
        {"_id": ObjectId(current_user.id)}, {"password_hash": 1}
    )
    if user_doc is None or not verify_password(
        password_data.current_password, user_doc["password_hash"]
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    now = datetime.now(timezone.utc)
    result = await db.users.update_one(
        {"_id": ObjectId(current_user.id)},
        {
            "$set": {
                "password_hash": get_password_hash(password_data.new_password),
                "updated_at": now,
            }
        },
    )
    if result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Password update failed",
        )
    return MessageResponse(message="Password updated")
