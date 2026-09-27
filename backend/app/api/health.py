from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.infrastructure.db.session import postgres_is_ready

router = APIRouter()


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/readyz")
async def readyz(request: Request) -> JSONResponse:
    ready = await postgres_is_ready(request.app.state.session_factory)
    if not ready:
        return JSONResponse(
            status_code=503,
            content={"status": "unavailable", "checks": {"postgres": "error"}},
        )
    return JSONResponse(status_code=200, content={"status": "ok", "checks": {"postgres": "ok"}})
