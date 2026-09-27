"""Model and video ports.

Business services depend on these protocols. Provider SDKs and LangChain stay in adapters
that do not exist yet. Polling and webhook differences stay behind the video provider.
"""

from enum import StrEnum
from typing import Protocol


class StatusSyncMode(StrEnum):
    POLLING = "polling"
    WEBHOOK = "webhook"


class RemoteGenerationState(StrEnum):
    """Observation from a provider. This is not the business task state."""

    UNKNOWN = "unknown"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


class RemoteObservation(Protocol):
    state: RemoteGenerationState
    provider_reference: str


class VideoProvider(Protocol):
    """Submit work and report how status should be collected.

    The default sync mode is polling. A later provider may return WEBHOOK without
    changing the generation task state machine.
    """

    name: str
    sync_mode: StatusSyncMode

    async def fetch_status(self, provider_reference: str) -> RemoteGenerationState:
        """Used by the polling worker and as a recovery check."""


class TextGenerationPort(Protocol):
    async def complete(self, prompt: str) -> str:
        """Text completion. The LangChain adapter will implement this later."""


class EmbeddingPort(Protocol):
    async def embed(self, text: str) -> list[float]:
        """Embedding vector. Dimensions are fixed per model version."""
