"""Watches the data folder and reports (debounced) changes made from outside the app."""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from pathlib import Path

from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer
from watchdog.observers.polling import PollingObserver

from .fsutil import is_temp_file

log = logging.getLogger(__name__)


class DataWatcher:
    """`poll_s` (TODOAPP_WATCH_POLL) rescans the folder every `poll_s` seconds instead of using the
    operating system's change events: slower, but works where events don't arrive, e.g. a Windows
    or Mac folder mounted into a Docker container."""

    def __init__(
        self,
        data_dir: Path,
        on_change: Callable[[], None],
        debounce_s: float = 0.3,
        poll_s: float | None = None,
    ):
        self.data_dir = Path(data_dir)
        self.on_change = on_change
        self.debounce_s = debounce_s
        self.poll_s = poll_s
        self._observer: Observer | None = None
        self._timer: threading.Timer | None = None
        self._lock = threading.Lock()
        self._stopped = False

    def start(self) -> None:
        with self._lock:
            if self._observer is not None:
                return
            self._stopped = False
            handler = _Handler(self)
            if self.poll_s is not None:
                observer = PollingObserver(timeout=self.poll_s)
            else:
                observer = Observer(timeout=0.1)  # default 1 s adds a second of latency
            try:
                observer.schedule(handler, str(self.data_dir), recursive=True)
                observer.start()
            except Exception:
                # e.g. inotify limits in a container. The app still works: changes made outside it
                # show on the next reload or restart instead of live.
                log.warning(
                    "Couldn't watch %s for outside changes; inbox drops and hand edits will show "
                    "after a reload or restart. Set TODOAPP_WATCH_POLL=2 to check every 2 seconds instead.",
                    self.data_dir,
                    exc_info=True,
                )
                return
            self._observer = observer

    @property
    def running(self) -> bool:
        return self._observer is not None

    def stop(self) -> None:
        """Safe to call repeatedly. Joins the observer thread."""
        with self._lock:
            self._stopped = True
            observer, self._observer = self._observer, None
            timer, self._timer = self._timer, None
        if timer is not None:
            timer.cancel()
        if observer is not None:
            observer.stop()
            observer.join()

    def _parts(self, p: Path) -> list[str]:
        try:
            return [x.lower() for x in p.relative_to(self.data_dir).parts]
        except ValueError:
            return [x.lower() for x in p.parts]

    def _in_processed(self, path: str) -> bool:
        parts = self._parts(Path(path))
        return any(part == "inbox" and parts[i + 1] == "processed" for i, part in enumerate(parts[:-1]))

    def _relevant(self, path: str) -> bool:
        p = Path(path)
        if is_temp_file(p.name):
            return False
        if ".trash" in self._parts(p):
            return False
        return not self._in_processed(path)

    def _poke(self) -> None:
        with self._lock:
            if self._stopped:
                return
            if self._timer is not None:
                self._timer.cancel()
            self._timer = threading.Timer(self.debounce_s, self._fire)
            self._timer.daemon = True
            self._timer.start()

    def _fire(self) -> None:
        if self._stopped:
            return
        try:
            self.on_change()
        except Exception:
            log.exception("Change handler failed")


class _Handler(FileSystemEventHandler):
    def __init__(self, watcher: DataWatcher):
        self._w = watcher

    def on_any_event(self, event: FileSystemEvent) -> None:
        if event.event_type == "opened" or event.event_type == "closed_no_write":
            return
        paths = [event.src_path, getattr(event, "dest_path", "")]
        if any(p and self._w._relevant(str(p)) for p in paths):
            self._w._poke()
        elif event.event_type in ("deleted", "moved") and self._w._in_processed(str(event.src_path)):
            # A processed file removed or renamed may clear its skipped-item problems.
            self._w._poke()
