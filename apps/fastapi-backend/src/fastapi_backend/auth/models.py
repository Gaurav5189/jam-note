from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field


class UserProfile(BaseModel):
    display_name: str | None = None
    avatar_url: str | None = None


class UserEditorPreferences(BaseModel):
    default_layout: str = "document"
    font_family: str = "Inter"
    font_size: int = 14


class UserSettings(BaseModel):
    theme: str = "dark-mono"
    editor_preferences: UserEditorPreferences = Field(default_factory=UserEditorPreferences)


class UserSignUp(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8)
    display_name: str | None = None


class UserLogin(BaseModel):
    email_or_username: str
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    username: str
    profile: UserProfile
    settings: UserSettings
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_mongo(cls, data: dict[str, Any]) -> "UserOut":
        return cls(
            id=str(data["_id"]),
            email=data["email"],
            username=data["username"],
            profile=UserProfile(**data.get("profile", {})),
            settings=UserSettings(**data.get("settings", {})),
            created_at=data["created_at"],
            updated_at=data["updated_at"],
        )


class MessageResponse(BaseModel):
    message: str
