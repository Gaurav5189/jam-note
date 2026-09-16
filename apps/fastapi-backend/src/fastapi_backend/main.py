from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from fastapi_backend.config import settings
from fastapi_backend.database import Database
from fastapi_backend.auth.router import router as auth_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await Database.connect()
    yield
    # Shutdown
    await Database.disconnect()


app = FastAPI(
    title="jam-note API",
    lifespan=lifespan,
)

# CORS middleware for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class HealthResponse(BaseModel):
    status: str
    database: str


@app.get("/api/health")
async def health_check() -> HealthResponse:
    db_status = "connected" if Database.db is not None else "disconnected"
    return HealthResponse(status="ok", database=db_status)


app.include_router(auth_router, prefix="/api")
