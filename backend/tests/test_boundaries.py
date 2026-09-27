from pathlib import Path

INFRASTRUCTURE = Path(__file__).resolve().parents[1] / "app" / "infrastructure"
FORBIDDEN_IMPORTS = ("fastapi", "langchain", "celery", "openai")


def test_ports_do_not_import_frameworks_or_provider_sdks() -> None:
    offenders: list[str] = []
    for path in INFRASTRUCTURE.rglob("*.py"):
        if "db" in path.parts:
            continue
        text = path.read_text(encoding="utf-8")
        for name in FORBIDDEN_IMPORTS:
            if f"import {name}" in text or f"from {name}" in text:
                offenders.append(f"{path.name}: {name}")
    assert offenders == []
