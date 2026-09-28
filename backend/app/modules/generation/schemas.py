from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class _StrictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CreateGenerationRequest(_StrictRequest):
    prompt: str
    parameters: dict = Field(default_factory=dict)
    reference_asset_ids: list[UUID] = Field(default_factory=list)
    kind: str = "image"


class GenerationErrorBody(BaseModel):
    code: str
    message: str
    retryable: bool


class GenerationTaskResponse(BaseModel):
    id: UUID
    status: str
    phase: str | None
    progress: int | None
    model_config_id: UUID
    created_at: datetime
    updated_at: datetime
    error: GenerationErrorBody | None
    output_asset_ids: list[UUID]
    reconciliation_required: bool
    allowed_actions: list[str]
    prompt: str
    kind: str = "image"


class GenerationTaskList(BaseModel):
    items: list[GenerationTaskResponse]
