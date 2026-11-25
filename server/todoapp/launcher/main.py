"""Entry point for `python -m todoapp` and the Windows executable.

From source it runs the server and opens the default browser. As the frozen Windows exe it
adds a single-instance check, an Edge/Chrome app window and a tray icon (spec section 4).
"""

from __future__ import annotations

import argparse
import os
import socket
import sys
import threading
import time
import webbrowser
from collections.abc import Callable
from pathlib import Path
from typing import Any

import platformdirs
import uvicorn

from ..app import create_app
from ..config import AppSettings, RuntimeOptions, default_config_path, load_settings, runtime_options
from . import browser, single_instance

STARTUP_FAILURE = 3  # uvicorn's exit code when the server never starts
START_TIMEOUT = 10.0  # seconds to wait for /api/health after starting the server
PORT_IN_USE = "Port {port} is in use by another program. Change the port in settings.json."


def is_windows_app() -> bool:
    return bool(getattr(sys, "frozen", False)) and sys.platform == "win32"


class AppServer(uvicorn.Server):
    """Runs on_shutdown first thing in uvicorn's shutdown, before it waits for open connections.
    (FastAPI's lifespan shutdown runs only after they drain, which is too late for SSE streams.)"""

    def __init__(self, config: uvicorn.Config, on_shutdown: Callable[[], None]) -> None:
        super().__init__(config)
        self._on_shutdown = on_shutdown

    async def shutdown(self, sockets: list[socket.socket] | None = None) -> None:
        self._on_shutdown()
        await super().shutdown(sockets)


def make_server(app: Any, host: str, port: int, **config: Any) -> uvicorn.Server:
    # Closing the bus ends the /api/events streams so Quit and Ctrl+C are instant; the short
    # graceful timeout is only a backstop.
    return AppServer(
        uvicorn.Config(app, host=host, port=port, timeout_graceful_shutdown=2, **config),
        on_shutdown=app.state.ctx.bus.close,
    )


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="todoapp")
    parser.add_argument("--data-dir", type=Path, help="data folder (this run only)")
    parser.add_argument("--port", type=int, help="port (this run only)")
    parser.add_argument("--config", type=Path, help="settings file to use")
    parser.add_argument("--no-browser", action="store_true", help="do not open a browser")
    return parser.parse_args(argv)


def _settings(args: argparse.Namespace) -> tuple[Path, AppSettings, dict[str, object]]:
    """The settings file, the saved settings, and the env/CLI overrides for this run only."""
    config_path = args.config if args.config is not None else default_config_path()
    base = load_settings(config_path, env={})  # the saved settings, no env applied
    with_env = load_settings(config_path)
    overrides: dict[str, object] = {
        k: getattr(with_env, k)
        for k in ("data_dir", "port")
        if getattr(with_env, k) != getattr(base, k)
    }
    if args.data_dir is not None:
        overrides["data_dir"] = args.data_dir
    if args.port is not None:
        overrides["port"] = args.port
    # Env and CLI overrides apply to this run only; they are never saved.
    return config_path, base, overrides


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    config_path, base, overrides = _settings(args)
    windows_app = is_windows_app()
    runtime = runtime_options(frozen=windows_app)
    if windows_app:
        return _run_windows_app(args, config_path, base, runtime, overrides)

    app = create_app(base, runtime, config_path, overrides)
    settings = app.state.ctx.settings
    if not args.no_browser:
        url = f"http://127.0.0.1:{settings.port}/"
        threading.Timer(1.0, webbrowser.open, args=(url,)).start()
    server = make_server(app, runtime.bind_host, settings.port)
    server.run()
    return 0 if server.started else STARTUP_FAILURE


# --- the frozen Windows exe ---------------------------------------------------


def message_box(text: str) -> None:
    import ctypes

    MB_OK_ICONWARNING = 0x30
    ctypes.windll.user32.MessageBoxW(None, text, "ToDoApp", MB_OK_ICONWARNING)


def _show_window(url: str) -> None:
    if not browser.focus_existing_window():
        browser.open_app_window(url)


# Quit waits for the app window to close before stopping the server: the closing page sends its
# last notes/task save (a keepalive request on pagehide), which needs the server still up.
QUIT_POLL_S = 0.05
QUIT_WAIT_S = 3.0
QUIT_GRACE_S = 0.5


def _quit_app(server, *, sleep=time.sleep, now=time.monotonic) -> None:
    """Tray Quit: close the app window (it would otherwise sit there dead, failing every click),
    wait until it has gone plus a grace for its final save, then stop the server. Runs on the
    tray thread, so waiting here blocks nothing else. Window problems never stop Quit."""
    try:
        if browser.close_app_windows():
            deadline = now() + QUIT_WAIT_S
            while browser.app_windows_open() and now() < deadline:
                sleep(QUIT_POLL_S)
            sleep(QUIT_GRACE_S)
    except Exception:
        pass
    server.should_exit = True


def _quiet_missing_streams() -> None:
    # A windowed exe has no console: sys.stdout/sys.stderr are None, and anything that
    # writes to them would crash. Send stray output nowhere; real logs go to the log file.
    if sys.stdout is None:
        sys.stdout = open(os.devnull, "w", encoding="utf-8")
    if sys.stderr is None:
        sys.stderr = open(os.devnull, "w", encoding="utf-8")


def log_file_path() -> Path:
    return Path(platformdirs.user_log_dir("ToDoApp", appauthor=False)) / "todoapp.log"


def file_log_config(log_file: Path) -> dict[str, Any]:
    """uvicorn logging that writes only to a rotating file, never to a console stream."""
    return {
        "version": 1,
        "disable_existing_loggers": False,
        # uvicorn sets use_colors on both formatter names when use_colors is given, so
        # "access" must exist; access records format fine with the default formatter.
        "formatters": {
            "default": {
                "()": "uvicorn.logging.DefaultFormatter",
                "fmt": "%(asctime)s %(levelprefix)s %(name)s: %(message)s",
                "use_colors": False,
            },
            "access": {"()": "uvicorn.logging.AccessFormatter", "use_colors": False},
        },
        # One handler for everything: two handlers rotating the same file would clash on Windows.
        "handlers": {
            "file": {
                "class": "logging.handlers.RotatingFileHandler",
                "filename": str(log_file),
                "maxBytes": 1_000_000,
                "backupCount": 3,
                "encoding": "utf-8",
                "formatter": "default",
            },
        },
        "loggers": {
            "uvicorn": {"level": "INFO"},
            "uvicorn.error": {"level": "INFO"},
            "uvicorn.access": {"level": "INFO"},
        },
        "root": {"handlers": ["file"], "level": "INFO"},
    }


def _log_config() -> tuple[dict[str, Any] | None, Path | None]:
    log_file = log_file_path()
    try:
        log_file.parent.mkdir(parents=True, exist_ok=True)
    except OSError:
        return None, None  # no log folder: run without logging rather than not at all
    return file_log_config(log_file), log_file


def _wait_until_up(server: uvicorn.Server, thread: threading.Thread, port: int) -> bool:
    deadline = time.monotonic() + START_TIMEOUT
    while time.monotonic() < deadline:
        if not thread.is_alive():
            return False  # couldn't bind (or lost a race with another launch)
        if server.started and single_instance.probe(port) == "ours":
            return True
        time.sleep(0.1)
    return False


def _run_windows_app(
    args: argparse.Namespace,
    config_path: Path,
    base: AppSettings,
    runtime: RuntimeOptions,
    overrides: dict[str, object],
) -> int:
    _quiet_missing_streams()
    port = int(overrides.get("port", base.port))
    url = f"http://127.0.0.1:{port}/"

    state = single_instance.probe(port)
    if state == "ours":
        if not args.no_browser:
            _show_window(url)
        return 0
    if state == "other":
        message_box(PORT_IN_USE.format(port=port))
        return 1

    from . import tray

    log_config, log_file = _log_config()
    app = create_app(base, runtime, config_path, overrides)
    server = make_server(app, runtime.bind_host, port, log_config=log_config, use_colors=False)
    thread = threading.Thread(target=server.run, name="uvicorn", daemon=True)
    thread.start()
    if not _wait_until_up(server, thread, port):
        server.should_exit = True
        if single_instance.probe(port) == "ours":  # another launch got there first
            if not args.no_browser:
                _show_window(url)
            return 0
        where = f" Details are in {log_file}." if log_file else ""
        message_box(f"ToDoApp couldn't start on port {port}.{where}")
        return 1

    if not args.no_browser:
        browser.open_app_window(url)

    tray.run_tray(on_open=lambda: _show_window(url), on_quit=lambda: _quit_app(server))
    server.should_exit = True
    thread.join(timeout=10)
    return 0
