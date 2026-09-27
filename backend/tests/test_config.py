from tests.conftest import make_settings


def test_settings_do_not_read_ambient_env(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://other:other@example.test/db")
    settings = make_settings()
    assert settings.environment == "testing"
    assert "127.0.0.1" in settings.database_url
