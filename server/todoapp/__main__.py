"""`python -m todoapp`: run the server (Task 18 adds the full Windows launcher)."""

from __future__ import annotations

import argparse
import threading
import webbrowser
from pathlib import Path

import uvicorn

from .app import create_app
from .config import default_config_path, load_settings, runtime_options


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="todoapp")
    parser.add_argument("--data-dir", type=Path, help="data folder (this run only)")
    parser.add_argument("--port", type=int, help="port (this run only)")
    parser.add_argument("--config", type=Path, help="settings file to use")
    parser.add_argument("--no-browser", action="store_true", help="do not open a browser")
    args = parser.parse_args(argv)

    config_path = args.config if args.config is not None else default_config_path()
    settings = load_settings(config_path)
    overrides: dict[str, object] = {}
    if args.data_dir is not None:
        overrides["data_dir"] = args.data_dir
    if args.port is not None:
        overrides["port"] = args.port
    if overrides:  # applies to this run only; never saved
        settings = settings.model_copy(update=overrides)
    runtime = runtime_options()
    app = create_app(settings, runtime, config_path)
    if not args.no_browser:
        url = f"http://127.0.0.1:{settings.port}/"
        threading.Timer(1.0, webbrowser.open, args=(url,)).start()
    uvicorn.run(app, host=runtime.bind_host, port=settings.port)


if __name__ == "__main__":
    main()
