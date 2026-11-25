"""Migrate legacy jam-note auth documents to BetterAuth.

Copies each `users` document into BetterAuth's native collections and
seeds the FastAPI-owned `profiles` collection. The legacy collections are
never mutated, so rollback is a matter of setting ``AUTH_MODE=legacy``
and redeploying the previous frontend build.

Usage:
    uv run python scripts/migrate_auth_to_betterauth.py --dry-run
    uv run python scripts/migrate_auth_to_betterauth.py
    uv run python scripts/migrate_auth_to_betterauth.py --force

Notes:
- Idempotent: documents are upserted by `_id`. Existing BetterAuth users
  are skipped unless ``--force`` is passed.
- The legacy bcrypt hash is copied verbatim into `account.password`; the
  BetterAuth `verify` hook in apps/next-frontend/lib/auth.ts uses bcrypt,
  so migrated users keep their existing passwords.
- Existing `jam_session` cookies are invalid after cutover. Users sign in
  again; that is expected and safe because the credential hash survives.
"""

from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient

from fastapi_backend.config import settings

DEFAULT_SETTINGS = {
    "theme": "dark-mono",
    "editor_preferences": {
        "default_layout": "document",
        "font_family": "Inter",
        "font_size": 14,
    },
}


def _ensure_datetime(value: Any, fallback: datetime) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return fallback
    return fallback


async def migrate(dry_run: bool, force: bool) -> None:
    client = AsyncIOMotorClient(settings.mongodb_url, serverSelectionTimeoutMS=15_000)
    db = client[settings.database_name]

    now = datetime.now(timezone.utc)
    totals = {"scanned": 0, "migrated": 0, "skipped": 0, "invalid": 0}

    async for legacy in db.users.find({}):
        totals["scanned"] += 1

        user_id = legacy.get("_id")
        if not isinstance(user_id, ObjectId):
            totals["invalid"] += 1
            continue

        email = legacy.get("email")
        username = legacy.get("username")
        password_hash = legacy.get("password_hash")
        if not email or not username or not password_hash:
            totals["invalid"] += 1
            continue

        existing = await db.user.find_one({"_id": user_id})
        if existing and not force:
            totals["skipped"] += 1
            continue

        profile = legacy.get("profile") or {}
        display_name = profile.get("display_name") or username
        avatar_url = profile.get("avatar_url")
        created_at = _ensure_datetime(legacy.get("created_at"), now)
        updated_at = _ensure_datetime(legacy.get("updated_at"), created_at)

        user_doc = {
            "_id": user_id,
            "name": display_name,
            "email": email,
            "emailVerified": True,
            "image": avatar_url,
            "username": username,
            "displayUsername": username,
            "createdAt": created_at,
            "updatedAt": updated_at,
        }
        account_doc = {
            "userId": user_id,
            "providerId": "credential",
            "accountId": str(user_id),
            # Copied verbatim — the bcrypt verify hook reads it.
            "password": password_hash,
            "createdAt": created_at,
            "updatedAt": updated_at,
        }
        profile_doc = {
            "user_id": user_id,
            "display_name": display_name,
            "avatar_url": avatar_url,
            "settings": legacy.get("settings") or DEFAULT_SETTINGS,
            "created_at": created_at,
            "updated_at": updated_at,
        }

        if dry_run:
            totals["migrated"] += 1
            continue

        # `user` and `profiles` key on `_id`; `account` is keyed by the
        # (userId, providerId) pair BetterAuth looks up.
        await db.user.replace_one({"_id": user_id}, user_doc, upsert=True)
        await db.account.replace_one(
            {"userId": user_id, "providerId": "credential"},
            account_doc,
            upsert=True,
        )
        await db.profiles.replace_one(
            {"user_id": user_id}, profile_doc, upsert=True
        )
        totals["migrated"] += 1

    client.close()

    verb = "would migrate" if dry_run else "migrated"
    print(
        f"scanned={totals['scanned']} {verb}={totals['migrated']} "
        f"skipped={totals['skipped']} invalid={totals['invalid']}"
    )


async def verify() -> None:
    """Compare collection counts and check every note/folder owner resolves."""
    client = AsyncIOMotorClient(settings.mongodb_url, serverSelectionTimeoutMS=15_000)
    db = client[settings.database_name]

    legacy_users = await db.users.count_documents({})
    auth_users = await db.user.count_documents({})
    accounts = await db.account.count_documents({"providerId": "credential"})
    profiles = await db.profiles.count_documents({})

    print(
        f"users={legacy_users} user={auth_users} "
        f"account={accounts} profiles={profiles}"
    )

    orphan_notes = 0
    orphan_folders = 0
    async for note in db.notes.find({}, {"user_id": 1}):
        owner = note.get("user_id")
        if isinstance(owner, ObjectId) and not await db.user.find_one(
            {"_id": owner}, {"_id": 1}
        ):
            orphan_notes += 1
    async for folder in db.folders.find({}, {"user_id": 1}):
        owner = folder.get("user_id")
        if isinstance(owner, ObjectId) and not await db.user.find_one(
            {"_id": owner}, {"_id": 1}
        ):
            orphan_folders += 1

    print(f"orphan_notes={orphan_notes} orphan_folders={orphan_folders}")
    client.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="report what would change without writing",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="overwrite existing BetterAuth user documents",
    )
    parser.add_argument(
        "--verify",
        action="store_true",
        help="only run the post-migration consistency check",
    )
    args = parser.parse_args()

    if args.verify:
        asyncio.run(verify())
        return

    asyncio.run(migrate(dry_run=args.dry_run, force=args.force))


if __name__ == "__main__":
    main()