"""Watches the data folder and reports (debounced) changes made from outside the app."""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from pathlib import Path

from watchdog.events import FileSystemEvent, FileSystemEventHandler
from watchdog.observers import Observer

from .fsutil import is_temp_file

log = logging.getLogger(__name__)


class DataWatcher:
    def __init__(self, data_dir: Path, on_change: Callable[[], None], debounce_s: float = 0.3):
        self.data_dir = Path(data_dir)
        self.on_change = on_change
        self.debounce_s = debounce_s
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
            observer = Observer(timeout=0.1)  # default 1 s adds a second of latency
            observer.schedule(handler, str(self.data_dir), recursive=True)
            observer.start()
            self._observer = observer

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

    def _relevant(self, path: str) -> bool:
        p = Path(path)
        if is_temp_file(p.name):
            return False
        try:
            parts = [x.lower() for x in p.relative_to(self.data_dir).parts]
        except ValueError:
            parts = [x.lower() for x in p.parts]
        if ".trash" in parts:
            return False
        for i, part in enumerate(parts[:-1]):
            if part == "inbox" and parts[i + 1] == "processed":
                return False
        return True

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
