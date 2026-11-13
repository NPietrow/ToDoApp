"""Localhost-only protection: Host check on everything, Origin check on writes.

Defends against DNS rebinding (Host) and cross-site requests from web pages the
user happens to have open (Origin). No CORS headers are ever sent.
"""

from __future__ import annotations

import json

from starlette.types import ASGIApp, Receive, Scope, Send

WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


class LocalOnlyMiddleware:
    def __init__(self, app: ASGIApp, ports: set[int]):
        self.app = app
        self.hosts = {f"{name}:{p}" for p in ports for name in ("127.0.0.1", "localhost")}
        self.origins = {f"http://{h}" for h in self.hosts}

    @staticmethod
    def _header(scope: Scope, name: bytes) -> str | None:
        for k, v in scope.get("headers", []):
            if k == name:
                return v.decode("latin-1")
        return None

    async def _deny(self, scope: Scope, send: Send, detail: str) -> None:
        if scope["type"] == "websocket":
            await send({"type": "websocket.close", "code": 1008})
            return
        body = json.dumps({"detail": detail}).encode()
        await send(
            {
                "type": "http.response.start",
                "status": 403,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "lifespan":
            await self.app(scope, receive, send)
            return
        if scope["type"] not in ("http", "websocket"):  # unknown scope: refuse
            return
        host = (self._header(scope, b"host") or "").strip().lower()
        if host not in self.hosts:
            await self._deny(scope, send, "host not allowed")
            return
        if scope["type"] == "http" and scope["method"] in WRITE_METHODS:
            origin = (self._header(scope, b"origin") or "").strip().lower()
            if origin not in self.origins:  # a missing or empty Origin fails too
                await self._deny(scope, send, "origin not allowed")
                return
        await self.app(scope, receive, send)
