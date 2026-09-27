from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.errors import ValidationError
from app.modules.projects.domain import PROJECT_NAME_MAX_LENGTH, ProjectRole, normalize_project_name


class _StrictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CreateProjectRequest(_StrictRequest):
    name: str = Field(min_length=1, max_length=PROJECT_NAME_MAX_LENGTH)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        try:
            return normalize_project_name(value)
        except ValidationError as exc:
            raise ValueError(exc.message) from exc


class UpdateProjectRequest(_StrictRequest):
    name: str = Field(min_length=1, max_length=PROJECT_NAME_MAX_LENGTH)
    expected_version: int = Field(ge=1)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        try:
            return normalize_project_name(value)
        except ValidationError as exc:
            raise ValueError(exc.message) from exc


class AddMemberRequest(_StrictRequest):
    user_id: UUID


class ProjectResponse(BaseModel):
    id: UUID
    name: str
    role: ProjectRole
    version: int
    created_at: datetime
    updated_at: datetime


class MemberResponse(BaseModel):
    user_id: UUID
    email: str
    role: ProjectRole


class ProjectListResponse(BaseModel):
    items: list[ProjectResponse]
    next_cursor: str | None


class MemberListResponse(BaseModel):
    items: list[MemberResponse]
    next_cursor: str | None
