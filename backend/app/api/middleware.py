from uuid import uuid4

from app.core.logging import bind_request_context, clear_request_context


class RequestContextMiddleware:
    """Attach request_id and trace_id to logs and the response."""

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = {
            key.decode("latin1").lower(): value.decode("latin1") for key, value in scope["headers"]
        }
        request_id = headers.get("x-request-id") or str(uuid4())
        trace_id = headers.get("x-trace-id") or request_id
        bind_request_context(request_id=request_id, trace_id=trace_id)

        async def send_with_context(message) -> None:
            if message["type"] == "http.response.start":
                message["headers"] = [
                    *message.get("headers", []),
                    (b"x-request-id", request_id.encode("latin1")),
                    (b"x-trace-id", trace_id.encode("latin1")),
                ]
            await send(message)

        try:
            await self.app(scope, receive, send_with_context)
        finally:
            clear_request_context()
