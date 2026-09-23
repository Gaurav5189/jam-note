from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


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


class UserUpdateMe(BaseModel):
    """PATCH /api/auth/me — Profile identity card, display name edit.

    Empty names are rejected (min_length after strip) — the concept's
    "Empty submit → red toast, no commit" contract is enforced
    server-side too. Falls back to the username for display when null,
    so clearing is not expressible; users edit to a real value.
    """

    display_name: str = Field(min_length=1, max_length=60)

    @field_validator("display_name", mode="before")
    @classmethod
    def strip_display_name(cls, value: object) -> object:
        # Strip before validation so whitespace-only names are rejected
        # by min_length instead of being stored as empty strings.
        if isinstance(value, str):
            return value.strip()
        return value


class PasswordUpdate(BaseModel):
    """PUT /api/auth/password — Profile security form.

    The confirm field is validated here so "Passwords don't match" is a
    structural rejection surfaced in the form's status line, matching
    the client's live validation exactly. `current_password` is verified
    server-side against the stored hash — rotation without knowing the
    old password must be impossible (an open session is not proof of
    ownership of the credential).
    """

    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)
    confirm_password: str = Field(min_length=8, max_length=128)

    @model_validator(mode="after")
    def passwords_match(self) -> "PasswordUpdate":
        if self.new_password != self.confirm_password:
            raise ValueError("Passwords don't match")
        return self


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
