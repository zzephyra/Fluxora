from app.core.config import Settings


def make_settings(**overrides: object) -> Settings:
    values = {
        "environment": "testing",
        "database_url": "postgresql+asyncpg://fluxora:fluxora@127.0.0.1:1/fluxora",
        "database_connect_timeout_seconds": 0.2,
        "log_level": "INFO",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)
