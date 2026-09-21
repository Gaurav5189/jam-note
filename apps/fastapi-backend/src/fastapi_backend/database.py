import logging

import certifi
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from fastapi_backend.config import settings

logger = logging.getLogger(__name__)

class Database:
    client: AsyncIOMotorClient | None = None
    db: AsyncIOMotorDatabase | None = None

    @classmethod
    async def connect(cls) -> None:
        try:
            logger.info(f"Connecting to MongoDB at {settings.mongodb_url}...")
            # Configure client with certifi CA bundle and appropriate timeout for Atlas cloud
            client_kwargs = {
                "serverSelectionTimeoutMS": 15000,
            }
            if settings.mongodb_url.startswith("mongodb+srv://") or "ssl=true" in settings.mongodb_url.lower() or "tls=true" in settings.mongodb_url.lower():
                client_kwargs["tlsCAFile"] = certifi.where()

            cls.client = AsyncIOMotorClient(settings.mongodb_url, **client_kwargs)
            cls.db = cls.client[settings.database_name]
            
            # Ping to verify connection
            await cls.db.command("ping")
            logger.info("Successfully connected to MongoDB!")
            
            # Setup indexes
            await cls.setup_indexes()
            
        except Exception as e:
            logger.warning(
                f"Could not establish connection to MongoDB at {settings.mongodb_url}: {e}. "
                "Database dependent routes will return 503 until MongoDB is accessible."
            )
            cls.client = None
            cls.db = None

    @classmethod
    async def disconnect(cls) -> None:
        if cls.client is not None:
            cls.client.close()
            cls.client = None
            cls.db = None
            logger.info("MongoDB connection closed.")

    @classmethod
    async def setup_indexes(cls) -> None:
        if cls.db is None:
            return
            
        users = cls.db.users
        await users.create_index("email", unique=True)
        await users.create_index("username", unique=True)

        folders = cls.db.folders
        await folders.create_index("user_id")
        await folders.create_index("parent_folder_id")

        notes = cls.db.notes
        await notes.create_index("user_id")
        await notes.create_index("folder_id")
        await notes.create_index("published_metadata.slug", unique=True, sparse=True)
        
        logger.info("Database indexes verified.")

def get_db() -> AsyncIOMotorDatabase:
    if Database.db is None:
        from fastapi import HTTPException, status
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable. Please ensure MongoDB is running and reachable.",
        )
    return Database.db
