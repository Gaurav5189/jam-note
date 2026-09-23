from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, status

from fastapi_backend.auth.dependencies import CurrentUserDep
from fastapi_backend.importing import models, service
from fastapi_backend.importing.models import ImportCommitOut, ImportPreviewOut
from fastapi_backend.notes.dependencies import DbDep

router = APIRouter(
    prefix="/import",
    tags=["import"],
)


async def _read_body(request: Request) -> bytes:
    """Size gate before the payload is parsed — reject oversized
    uploads on the declared length, then re-check the actual body."""
    declared = request.headers.get("content-length")
    if declared is not None:
        try:
            if int(declared) > models.MAX_JSON_BYTES:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Too large — 10 MB max",
                )
        except ValueError:
            # Malformed header — the byte-length check in
            # parse_manifest_body still applies.
            pass
    return await request.body()


@router.post("/preview")
async def import_preview(
    request: Request,
    current_user: CurrentUserDep,
    db: DbDep,
) -> ImportPreviewOut:
    """Validate a backup and return its counts — "47 notes, 12
    folders — confirm?" Nothing is committed."""
    body = await _read_body(request)
    manifest = service.parse_manifest_body(body)
    service.validate_content(manifest)
    return service.preview_manifest(manifest, len(body))


@router.post("/commit")
async def import_commit(
    request: Request,
    current_user: CurrentUserDep,
    db: DbDep,
    import_token: Annotated[
        str | None,
        Query(
            max_length=64,
            pattern=r"^[A-Za-z0-9_-]{1,64}$",
            description=(
                "Client-generated idempotency token — retrying a lost "
                "response with the same token replays instead of "
                "double-importing."
            ),
        ),
    ] = None,
) -> ImportCommitOut:
    """Perform the validated import — one transaction, all or nothing.
    Send the same `import_token` on every retry of one file: if the
    earlier commit actually landed (the response was lost), the stored
    receipt is replayed instead of importing the notes again."""
    body = await _read_body(request)
    manifest = service.parse_manifest_body(body)
    service.validate_content(manifest)
    return await service.commit_manifest(
        db, current_user.id, manifest, import_token=import_token
    )
