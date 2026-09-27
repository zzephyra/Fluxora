from app.main import create_app
from fastapi.testclient import TestClient

from tests.conftest import make_settings


def test_healthz_does_not_require_postgres() -> None:
    with TestClient(create_app(make_settings())) as client:
        response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["x-request-id"]
    assert response.headers["x-trace-id"] == response.headers["x-request-id"]


def test_readyz_reports_postgres_unavailable() -> None:
    with TestClient(create_app(make_settings())) as client:
        response = client.get("/readyz")
    assert response.status_code == 503
    assert response.json()["checks"]["postgres"] == "error"


def test_trace_id_is_preserved() -> None:
    with TestClient(create_app(make_settings())) as client:
        response = client.get(
            "/healthz",
            headers={"X-Trace-ID": "trace-123", "X-Request-ID": "req-123"},
        )
    assert response.headers["x-request-id"] == "req-123"
    assert response.headers["x-trace-id"] == "trace-123"
