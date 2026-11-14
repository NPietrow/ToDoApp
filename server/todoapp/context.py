"""Shared application state: repositories, settings, lock and event bus."""

from __future__ import annotations

import threading
from pathlib import Path

from .config import AppSettings, RuntimeOptions, default_config_path
from .config import save_settings as write_settings
from .events import EventBus
from .inbox import process_inbox
from .models import Project, utcnow
from .store.notes import NotesRepository
from .store.projects import ProjectRepository
from .store.tasks import FileProblem, TaskRepository
from .watcher import DataWatcher


PROJECTS_UNREADABLE = "projects.json can't be read — fix it or move it aside"


class GuardedProjectRepository(ProjectRepository):
    """Refuses every write while projects.json is unreadable, so it is never overwritten."""

    def _guard(self) -> None:
        try:
            self._load()
        except (OSError, ValueError, KeyError, TypeError) as e:
            raise ValueError(PROJECTS_UNREADABLE) from e

    def create(self, *args, **kwargs):
        self._guard()
        return super().create(*args, **kwargs)

    def rename(self, *args, **kwargs):
        self._guard()
        return super().rename(*args, **kwargs)

    def set_colour(self, *args, **kwargs):
        self._guard()
        return super().set_colour(*args, **kwargs)

    def move(self, *args, **kwargs):
        self._guard()
        return super().move(*args, **kwargs)

    def close(self, *args, **kwargs):
        self._guard()
        return super().close(*args, **kwargs)

    def reopen(self, *args, **kwargs):
        self._guard()
        return super().reopen(*args, **kwargs)


class AppContext:
    def __init__(
        self,
        settings: AppSettings,
        runtime: RuntimeOptions,
        config_path: Path | None = None,
        overrides: dict[str, object] | None = None,
    ):
        # `settings` is the saved base; `overrides` (CLI/env) apply to this run only
        # and are never written to the settings file.
        self.saved_settings = settings
        self.overrides: dict[str, object] = dict(overrides or {})
        self.settings = self.effective(settings, self.overrides)
        self.runtime = runtime
        self.config_path = config_path if config_path is not None else default_config_path()
        self.bus = EventBus()
        # Hold this for any write: `with ctx.lock:` (re-entrant, so nesting is fine).
        self.lock = threading.RLock()
        self.inbox_problems: list[FileProblem] = []
        self._watcher: DataWatcher | None = None
        self._build_repositories()

    @staticmethod
    def effective(base: AppSettings, overrides: dict[str, object]) -> AppSettings:
        return AppSettings.model_validate({**base.model_dump(), **overrides})

    def _build_repositories(self) -> None:
        d = Path(self.settings.data_dir)
        self.tasks = TaskRepository(d)
        self.projects = GuardedProjectRepository(d)
        self.notes = NotesRepository(d)

    def read_projects(self) -> tuple[list[Project], FileProblem | None]:
        """All projects, or ([], problem) if projects.json is unreadable."""
        try:
            return self.projects.list(), None
        except (OSError, ValueError, KeyError, TypeError) as e:
            return [], FileProblem("projects.json", str(e))

    def refresh(self) -> None:
        """Process the inbox, rescan tasks and tell browsers something changed."""
        with self.lock:
            projects, problem = self.read_projects()
            active = [p for p in projects if p.status == "active"]
            if problem is None:
                result = process_inbox(Path(self.settings.data_dir), self.tasks, active, utcnow())
                self.inbox_problems = result.problems
            else:
                # Hold the inbox: importing now would lose project assignments.
                self.inbox_problems = []
            self.tasks.scan(active, known=projects)
        self.bus.publish("changed")

    def start_watcher(self) -> None:
        """Watch the current data folder, replacing any earlier watcher."""
        with self.lock:
            self.stop_watcher()
            d = Path(self.settings.data_dir)
            d.mkdir(parents=True, exist_ok=True)
            self._watcher = DataWatcher(d, self.refresh)
            self._watcher.start()

    def stop_watcher(self) -> None:
        with self.lock:
            watcher, self._watcher = self._watcher, None
        if watcher is not None:
            watcher.stop()

    def switch_data_dir(self, path: Path) -> None:
        with self.lock:
            path = Path(path)
            path.mkdir(parents=True, exist_ok=True)
            self.settings = self.settings.model_copy(update={"data_dir": path})
            self._build_repositories()
            was_watching = self._watcher is not None
            self.stop_watcher()
            self.refresh()
            if was_watching:
                self.start_watcher()

    def save_settings(self) -> None:
        with self.lock:
            write_settings(self.saved_settings, self.config_path)
