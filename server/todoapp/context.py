"""Shared application state: repositories, settings, lock and event bus."""

from __future__ import annotations

import threading
from pathlib import Path

from .config import AppSettings, RuntimeOptions, default_config_path
from .config import save_settings as write_settings
from .events import EventBus
from .inbox import process_inbox
from .models import utcnow
from .store.notes import NotesRepository
from .store.projects import ProjectRepository
from .store.tasks import FileProblem, TaskRepository


class AppContext:
    def __init__(self, settings: AppSettings, runtime: RuntimeOptions, config_path: Path | None = None):
        self.settings = settings
        self.runtime = runtime
        self.config_path = config_path if config_path is not None else default_config_path()
        self.bus = EventBus()
        # Hold this for any write: `with ctx.lock:` (re-entrant, so nesting is fine).
        self.lock = threading.RLock()
        self.inbox_problems: list[FileProblem] = []
        self._build_repositories()

    def _build_repositories(self) -> None:
        d = Path(self.settings.data_dir)
        self.tasks = TaskRepository(d)
        self.projects = ProjectRepository(d)
        self.notes = NotesRepository(d)

    def refresh(self) -> None:
        """Process the inbox, rescan tasks and tell browsers something changed."""
        with self.lock:
            active = self.projects.active()
            result = process_inbox(Path(self.settings.data_dir), self.tasks, active, utcnow())
            self.inbox_problems = result.problems
            self.tasks.scan(active)
        self.bus.publish("changed")

    def switch_data_dir(self, path: Path) -> None:
        with self.lock:
            path = Path(path)
            path.mkdir(parents=True, exist_ok=True)
            self.settings = self.settings.model_copy(update={"data_dir": path})
            self._build_repositories()
            # Task 8 restarts the folder watcher here.
            self.refresh()

    def save_settings(self) -> None:
        with self.lock:
            write_settings(self.settings, self.config_path)
