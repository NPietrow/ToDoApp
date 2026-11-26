"""Server-sent events: tells the browser to refetch /api/state."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from ..events import SHUTDOWN

router = APIRouter(prefix="/api")

HEARTBEAT_S = 15.0


@router.get("/events")
async def events(request: Request) -> StreamingResponse:
    bus = request.app.state.ctx.bus
    if not bus.has_loop():
        bus.bind_loop(asyncio.get_running_loop())
    q = bus.subscribe()  # before the first yield, so an early publish isn't lost

    async def stream() -> AsyncIterator[str]:
        try:
            while not bus.closed:
                try:
                    kind = await asyncio.wait_for(q.get(), HEARTBEAT_S)
                except TimeoutError:
                    yield ": ping\n\n"
                else:
                    if kind == SHUTDOWN:
                        return
                    yield "event: changed\ndata: {}\n\n"
        finally:
            bus.unsubscribe(q)

    return StreamingResponse(
        stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"}
    )
