"""Change notifications for connected browsers (consumed by SSE in Task 8)."""

from __future__ import annotations

import asyncio
import threading


class EventBus:
    def __init__(self) -> None:
        self._loop: asyncio.AbstractEventLoop | None = None
        self._subs: list[asyncio.Queue[str]] = []
        self._guard = threading.Lock()

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def has_loop(self) -> bool:
        return self._loop is not None

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
        loop = self._loop
        if loop is None:
            return
        with self._guard:
            subs = list(self._subs)
        for q in subs:
            try:
                loop.call_soon_threadsafe(q.put_nowait, kind)
            except RuntimeError:  # loop already closed
                pass
