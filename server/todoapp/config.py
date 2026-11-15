"""User settings (stored outside the data folder) and runtime options."""

from __future__ import annotations

import os
from collections.abc import Mapping
from pathlib import Path
from typing import Literal

import platformdirs
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from todoapp.fsutil import atomic_write_json, read_json

DEFAULT_PORT = 8765


def default_config_path() -> Path:
    return Path(platformdirs.user_config_dir("ToDoApp", appauthor=False)) / "settings.json"


def default_data_dir() -> Path:
    return Path(platformdirs.user_documents_dir()) / "ToDoApp"


class AppSettings(BaseModel):
    data_dir: Path = Field(default_factory=default_data_dir)
    port: int = Field(default=DEFAULT_PORT, ge=1, le=65535)
    text_size: Literal["small", "medium", "large"] = "medium"
    collapsed_projects: list[str] = Field(default_factory=list)
    collapsed_rows: list[Literal["urgent", "quick", "general", "objective", "notes"]] = Field(
        default_factory=list
    )
    show_completed: bool = False
    start_at_login: bool = False


class RuntimeOptions(BaseModel):
    model_config = ConfigDict(frozen=True)

    bind_host: str = "127.0.0.1"
    public_port: int | None = None
    windows_app: bool = False
    # TODOAPP_WATCH_POLL: rescan the data folder every N seconds instead of OS change events.
    watch_poll_s: float | None = None


def _port_from(value: str | None) -> int | None:
    """Parse a port string; None if absent or not an integer in 1-65535."""
    if value is None:
        return None
    try:
        port = int(value.strip())
    except ValueError:
        return None
    return port if 1 <= port <= 65535 else None


def load_settings(
    path: Path | None = None, env: Mapping[str, str] | None = None
) -> AppSettings:
    """Load settings; a missing or corrupt file gives defaults, and an invalid field
    gives that field's default (the rest of the file, data_dir included, still counts).

    The file is never rewritten or deleted here. Valid TODOAPP_DATA_DIR and
    TODOAPP_PORT values override the file; invalid ones are ignored.
    """
    path = path if path is not None else default_config_path()
    env = env if env is not None else os.environ
    try:
        raw = read_json(path)
    except (OSError, ValueError):
        raw = {}
    good: dict[str, object] = {}
    if isinstance(raw, dict):
        for key, value in raw.items():
            if key not in AppSettings.model_fields:
                continue
            try:
                AppSettings.model_validate({key: value})
            except ValidationError:
                continue  # just this field falls back to its default
            good[key] = value
    settings = AppSettings.model_validate(good)
    updates: dict[str, object] = {}
    if env.get("TODOAPP_DATA_DIR", "").strip():
        updates["data_dir"] = Path(env["TODOAPP_DATA_DIR"].strip())
    port = _port_from(env.get("TODOAPP_PORT"))
    if port is not None:
        updates["port"] = port
    return settings.model_copy(update=updates) if updates else settings


def save_settings(s: AppSettings, path: Path | None = None) -> None:
    path = path if path is not None else default_config_path()
    atomic_write_json(path, s.model_dump(mode="json"))


def runtime_options(
    env: Mapping[str, str] | None = None, frozen: bool = False
) -> RuntimeOptions:
    env = env if env is not None else os.environ
    host = env.get("TODOAPP_HOST", "").strip() or "127.0.0.1"
    return RuntimeOptions(
        bind_host=host,
        public_port=_port_from(env.get("TODOAPP_PUBLIC_PORT")),
        windows_app=frozen,
        watch_poll_s=_poll_from(env.get("TODOAPP_WATCH_POLL")),
    )


def _poll_from(value: str | None) -> float | None:
    """Seconds between folder rescans, 0.5-60; None (use OS change events) if absent or invalid."""
    try:
        seconds = float((value or "").strip())
    except ValueError:
        return None
    return seconds if 0.5 <= seconds <= 60 else None
