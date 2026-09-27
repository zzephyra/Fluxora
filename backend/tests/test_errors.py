from app.api.exception_handlers import register_exception_handlers
from app.api.middleware import RequestContextMiddleware
from app.core.errors import NotFoundError
from app.main import create_app
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel

from tests.conftest import make_settings


def _client_with_probe() -> TestClient:
    app = create_app(make_settings())

    class Payload(BaseModel):
        name: str

    @app.get("/_probe/missing")
    async def missing() -> None:
        raise NotFoundError("Project was not found", details={"project_id": "p1"})

    @app.post("/_probe/echo")
    async def echo(payload: Payload) -> dict[str, str]:
        return {"name": payload.name}

    @app.get("/_probe/boom")
    async def boom() -> None:
        raise RuntimeError("boom")

    return TestClient(app, raise_server_exceptions=False)


def test_application_error_uses_the_standard_body() -> None:
    with _client_with_probe() as client:
        response = client.get("/_probe/missing", headers={"X-Request-ID": "req-404"})
    body = response.json()
    assert response.status_code == 404
    assert body["request_id"] == "req-404"
    assert body["error"]["code"] == "not_found"
    assert body["error"]["details"]["project_id"] == "p1"


def test_validation_error_uses_the_standard_body() -> None:
    with _client_with_probe() as client:
        response = client.post("/_probe/echo", json={})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_unexpected_error_hides_the_exception_text() -> None:
    with _client_with_probe() as client:
        response = client.get("/_probe/boom")
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "internal_error"
    assert "boom" not in response.text


def test_handler_registration_accepts_a_plain_app() -> None:
    app = FastAPI()
    app.add_middleware(RequestContextMiddleware)
    register_exception_handlers(app)
    assert app.exception_handlers
