"""Change notifications for connected browsers (consumed by SSE in Task 8)."""

from __future__ import annotations

import asyncio
import threading

SHUTDOWN = "shutdown"  # queued to every subscriber by close(); the SSE stream returns on it


class EventBus:
    def __init__(self) -> None:
        self._closed = False
        self._loop: asyncio.AbstractEventLoop | None = None
        self._subs: list[asyncio.Queue[str]] = []
        self._guard = threading.Lock()

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def has_loop(self) -> bool:
        return self._loop is not None

    @property
    def closed(self) -> bool:
        return self._closed

    def subscribe(self) -> asyncio.Queue[str]:
        q: asyncio.Queue[str] = asyncio.Queue()
        with self._guard:
            self._subs.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue[str]) -> None:
        with self._guard:
            if q in self._subs:
                self._subs.remove(q)

    def publish(self, kind: str = "changed") -> None:
        """Safe from any thread. Dropped silently if no loop is bound yet."""
        self._send(kind)

    def close(self) -> None:
        """Safe from any thread, including the loop thread. Tells every stream to finish, and
        silences later publishes."""
        self._send(SHUTDOWN, closing=True)

    def _send(self, kind: str, *, closing: bool = False) -> None:
        with self._guard:
            if self._closed:
                return
            if closing:
                self._closed = True
            subs = list(self._subs)
        loop = self._loop
        if loop is None:
            return
        for q in subs:
            try:
                loop.call_soon_threadsafe(q.put_nowait, kind)
            except RuntimeError:  # loop already closed
                pass
