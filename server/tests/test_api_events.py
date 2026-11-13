import asyncio

import pytest

from todoapp.api import events as events_api

HOST = [(b"host", b"127.0.0.1:8765"), (b"origin", b"http://127.0.0.1:8765")]


class Stream:
    """Drive the ASGI app directly: httpx's ASGITransport buffers a whole response,
    so it can't read an endless event stream."""

    def __init__(self, app, path="/api/events"):
        self.sent: asyncio.Queue = asyncio.Queue()
        self._disconnect = asyncio.Event()
        scope = {
            "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": "GET",
            "path": path, "raw_path": path.encode(), "query_string": b"", "root_path": "",
            "scheme": "http", "headers": HOST, "client": ("127.0.0.1", 50000), "server": ("127.0.0.1", 8765),
        }

        async def receive():
            await self._disconnect.wait()
            return {"type": "http.disconnect"}

        async def send(message):
            await self.sent.put(message)

        self.task = asyncio.ensure_future(app(scope, receive, send))

    async def next(self, timeout=3.0):
        return await asyncio.wait_for(self.sent.get(), timeout)

    async def body_text(self, timeout=3.0) -> str:
        msg = await self.next(timeout)
        assert msg["type"] == "http.response.body"
        return msg["body"].decode()

    async def close(self):
        self._disconnect.set()
        try:
            await asyncio.wait_for(self.task, 3)
        except asyncio.CancelledError:
            pass


async def test_events_stream_receives_publish(app_and_ctx):
    app, ctx = app_and_ctx
    s = Stream(app)
    try:
        start = await s.next()
        assert start["status"] == 200
        headers = {k.lower(): v for k, v in start["headers"]}
        assert headers[b"content-type"].startswith(b"text/event-stream")
        assert headers[b"cache-control"] == b"no-cache"
        assert b"access-control-allow-origin" not in headers
        await asyncio.sleep(0.05)  # let the handler subscribe
        ctx.bus.publish()
        assert await s.body_text() == "event: changed\ndata: {}\n\n"
    finally:
        await s.close()
    assert ctx.bus._subs == []  # unsubscribed on disconnect


async def test_events_sends_ping_when_idle(app_and_ctx, monkeypatch):
    monkeypatch.setattr(events_api, "HEARTBEAT_S", 0.1)
    app, ctx = app_and_ctx
    s = Stream(app)
    try:
        await s.next()
        assert await s.body_text() == ": ping\n\n"
    finally:
        await s.close()


async def test_events_refuses_foreign_host(app_and_ctx):
    app, _ = app_and_ctx
    sent = []

    async def receive():
        await asyncio.sleep(10)

    async def send(m):
        sent.append(m)

    scope = {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": "GET",
        "path": "/api/events", "raw_path": b"/api/events", "query_string": b"", "root_path": "",
        "scheme": "http", "headers": [(b"host", b"evil.example")], "client": ("127.0.0.1", 1),
        "server": ("127.0.0.1", 8765),
    }
    await app(scope, receive, send)
    assert sent[0]["status"] in (400, 403)
