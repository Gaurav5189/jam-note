"""App-specific account routes.

BetterAuth owns `/api/auth/*` in the Next.js layer, so these endpoints live
under `/api/account/*` to avoid the route-handler shadowing documented in
DOCS/BETTERAUTH_MIGRATION_PLAN.md. Identity mutations (display name,
password) are handled by BetterAuth's client API; this router only exposes
the composed `UserOut` shape the UI already consumes.
"""

from fastapi import APIRouter

from fastapi_backend.auth.dependencies import CurrentUserDep
from fastapi_backend.auth.models import UserOut

router = APIRouter(prefix="/account", tags=["account"])


@router.get("/me")
async def get_me(current_user: CurrentUserDep) -> UserOut:
    return current_user
