from app.core.errors import ValidationError
from app.infrastructure.parsing.documents import (
    DocumentFormat,
    DocumentParser,
    ParsedDocument,
    ParserRegistry,
    resolve_document_format,
)


class _TextParser:
    document_format = DocumentFormat.TXT

    def parse(self, content: bytes) -> ParsedDocument:
        return ParsedDocument(text=content.decode("utf-8"))


def test_resolve_initial_formats() -> None:
    assert resolve_document_format(filename="notes.md") is DocumentFormat.MARKDOWN
    assert (
        resolve_document_format(filename="a.pdf", content_type="application/pdf")
        is DocumentFormat.PDF
    )
    assert resolve_document_format(filename="a.docx") is DocumentFormat.DOCX
    assert (
        resolve_document_format(filename="a.txt", content_type="text/plain")
        is DocumentFormat.TXT
    )


def test_rejects_formats_outside_the_initial_set() -> None:
    try:
        resolve_document_format(filename="sheet.xlsx")
    except ValidationError as exc:
        assert exc.code == "validation_error"
    else:
        raise AssertionError("xlsx must not resolve in the skeleton")


def test_rejects_conflicting_filename_and_content_type() -> None:
    try:
        resolve_document_format(filename="notes.md", content_type="application/pdf")
    except ValidationError as exc:
        assert "different formats" in exc.message
    else:
        raise AssertionError("conflicting types must be rejected")


def test_registry_returns_only_registered_parsers() -> None:
    registry = ParserRegistry()
    parser: DocumentParser = _TextParser()
    registry.register(parser)
    assert registry.get(DocumentFormat.TXT).parse(b"hello").text == "hello"
    try:
        registry.get(DocumentFormat.PDF)
    except ValidationError as exc:
        assert exc.details == {"document_format": "pdf"}
    else:
        raise AssertionError("unregistered parser must fail")
