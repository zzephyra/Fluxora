"""Document parsing port.

Business code asks for a DocumentFormat and a Parser. It does not branch on file extensions.
PDF, DOCX, TXT, and Markdown parsers are added when the knowledge feature is implemented.
"""

from dataclasses import dataclass
from enum import StrEnum
from typing import Protocol

from app.core.errors import ValidationError


class DocumentFormat(StrEnum):
    PDF = "pdf"
    DOCX = "docx"
    TXT = "txt"
    MARKDOWN = "markdown"


_EXTENSIONS = {
    ".pdf": DocumentFormat.PDF,
    ".docx": DocumentFormat.DOCX,
    ".txt": DocumentFormat.TXT,
    ".md": DocumentFormat.MARKDOWN,
    ".markdown": DocumentFormat.MARKDOWN,
}

_CONTENT_TYPES = {
    "application/pdf": DocumentFormat.PDF,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": DocumentFormat.DOCX,
    "text/plain": DocumentFormat.TXT,
    "text/markdown": DocumentFormat.MARKDOWN,
}


@dataclass(frozen=True)
class ParsedDocument:
    text: str


class DocumentParser(Protocol):
    document_format: DocumentFormat

    def parse(self, content: bytes) -> ParsedDocument:
        """Return normalized text. Chunking and indexing happen after this step."""


class ParserRegistry:
    def __init__(self) -> None:
        self._parsers: dict[DocumentFormat, DocumentParser] = {}

    def register(self, parser: DocumentParser) -> None:
        self._parsers[parser.document_format] = parser

    def get(self, document_format: DocumentFormat) -> DocumentParser:
        try:
            return self._parsers[document_format]
        except KeyError as exc:
            raise ValidationError(
                "No parser is registered for this document format",
                details={"document_format": document_format.value},
            ) from exc


def resolve_document_format(*, filename: str, content_type: str | None = None) -> DocumentFormat:
    """Single place that recognizes the initial document formats."""

    extension = _extension(filename)
    by_name = _EXTENSIONS.get(extension)
    by_type = _CONTENT_TYPES.get((content_type or "").split(";", 1)[0].strip().lower())
    if by_name is None and by_type is None:
        raise ValidationError(
            "Unsupported document format",
            details={"filename": filename, "content_type": content_type},
        )
    if by_name is not None and by_type is not None and by_name is not by_type:
        raise ValidationError(
            "Filename and content type describe different formats",
            details={"filename": filename, "content_type": content_type},
        )
    resolved = by_name or by_type
    if resolved is None:
        raise ValidationError("Unsupported document format")
    return resolved


def _extension(filename: str) -> str:
    dot = filename.rfind(".")
    if dot < 0:
        return ""
    return filename[dot:].lower()
