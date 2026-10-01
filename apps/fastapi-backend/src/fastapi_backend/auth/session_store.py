import uuid
from datetime import datetime, timezone
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId

SESSION_COLLECTION = "user_sessions"


async def create_session(db: AsyncIOMotorDatabase, user_id: str, jti: str) -> None:
    await db[SESSION_COLLECTION].insert_one({
        "_id": jti,
        "user_id": ObjectId(user_id),
        "created_at": datetime.now(timezone.utc),
        "revoked_at": None,
    })


async def revoke_session(db: AsyncIOMotorDatabase, jti: str) -> bool:
    result = await db[SESSION_COLLECTION].update_one(
        {"_id": jti, "revoked_at": None},
        {"$set": {"revoked_at": datetime.now(timezone.utc)}},
    )
    return result.modified_count > 0


async def is_session_valid(db: AsyncIOMotorDatabase, jti: str) -> bool:
    doc = await db[SESSION_COLLECTION].find_one({"_id": jti})
    if not doc:
        return False
    if doc.get("revoked_at") is not None:
        return False
    return True
