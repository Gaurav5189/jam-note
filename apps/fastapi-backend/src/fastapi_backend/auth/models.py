import re
from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


# Regex for detecting emoji characters (broad coverage)
EMOJI_REGEX = re.compile(
    r"[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF"
    r"\U0001F1E0-\U0001F1FF\U00002600-\U000026FF\U00002700-\U000027BF"
    r"\U0001F900-\U0001F9FF\U0001F180-\U0001F1FF\U00002300-\U000023FF"
    r"\U000024C2-\U0001F251\U0001F200-\U0001F2FF\U00002702-\U000027B0"
    r"\U0001F000-\U0001F02F\U0001F030-\U0001F09F\U0001F0A0-\U0001F0FF"
    r"\U0001F100-\U0001F2FF\U0001F650-\U0001F67F\U0001F700-\U0001F77F"
    r"\U0001F780-\U0001F7FF\U0001F800-\U0001F8FF]"
)
USERNAME_REGEX = re.compile(r"^[a-zA-Z0-9_]+$")
DISPLAY_NAME_REGEX = re.compile(r"^[a-zA-Z0-9 ]+$")


def no_emoji(value: str) -> str:
    if EMOJI_REGEX.search(value):
        raise ValueError("Emoji characters are not allowed")
    return value


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
    password: str = Field(min_length=8, max_length=128)
    display_name: str | None = None

    @field_validator("email", mode="before")
    @classmethod
    def check_email_emoji(cls, value: object) -> object:
        if isinstance(value, str):
            no_emoji(value)
        return value

    @field_validator("username", mode="before")
    @classmethod
    def check_username(cls, value: object) -> object:
        if isinstance(value, str):
            value = value.strip()
            no_emoji(value)
            if not USERNAME_REGEX.fullmatch(value):
                raise ValueError("Username must contain only alphanumeric characters and underscores")
        return value

    @field_validator("password", mode="before")
    @classmethod
    def check_password_emoji(cls, value: object) -> object:
        if isinstance(value, str):
            no_emoji(value)
        return value

    @field_validator("display_name", mode="before")
    @classmethod
    def check_display_name(cls, value: object) -> object:
        if isinstance(value, str):
            value = value.strip()
            if value == "":
                return value  # allow empty which becomes None? or keep as is
            no_emoji(value)
            if not DISPLAY_NAME_REGEX.fullmatch(value):
                raise ValueError("Display name must contain only alphanumeric characters and spaces")
        return value


class UserLogin(BaseModel):
    email_or_username: str
    password: str

    @field_validator("email_or_username", mode="before")
    @classmethod
    def check_login_emoji(cls, value: object) -> object:
        if isinstance(value, str):
            no_emoji(value)
        return value

    @field_validator("password", mode="before")
    @classmethod
    def check_login_password_emoji(cls, value: object) -> object:
        if isinstance(value, str):
            no_emoji(value)
        return value


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
            value = value.strip()
        return value

    @field_validator("display_name", mode="before")
    @classmethod
    def check_display_name_emoji(cls, value: object) -> object:
        if isinstance(value, str):
            no_emoji(value)
            if value and not DISPLAY_NAME_REGEX.fullmatch(value):
                raise ValueError("Display name must contain only alphanumeric characters and spaces")
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

    @field_validator("current_password", mode="before")
    @classmethod
    def check_current_password_emoji(cls, value: object) -> object:
        if isinstance(value, str):
            no_emoji(value)
        return value

    @field_validator("new_password", mode="before")
    @classmethod
    def check_new_password_emoji(cls, value: object) -> object:
        if isinstance(value, str):
            no_emoji(value)
        return value

    @field_validator("confirm_password", mode="before")
    @classmethod
    def check_confirm_password_emoji(cls, value: object) -> object:
        if isinstance(value, str):
            no_emoji(value)
        return value

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
