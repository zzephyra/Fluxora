from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

UploadCategory = Literal["image", "video", "file"]


class _StrictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class UploadTokenRequest(_StrictRequest):
    filename: str = Field(min_length=1, max_length=200)
    content_type: str = Field(min_length=1, max_length=120)
    size: int = Field(ge=1)
    category: UploadCategory
    key: str | None = Field(default=None, max_length=512)


class UploadCompleteRequest(_StrictRequest):
    key: str = Field(min_length=1, max_length=512)


class UploadTokenResponse(BaseModel):
    token: str
    key: str
    domain: str
    upload_url: str
    expires_in: int


class UploadFileResponse(BaseModel):
    id: UUID
    key: str
    url: str
    original_filename: str
    content_type: str
    size: int
    category: UploadCategory
    status: Literal["pending", "uploaded", "failed", "deleted"]
    provider: Literal["qiniu"]
    created_at: datetime
    updated_at: datetime


class UploadLimitsResponse(BaseModel):
    image: int
    video: int
    file: int


class UploadListResponse(BaseModel):
    items: list[UploadFileResponse]
    limits: UploadLimitsResponse
