"""FastAPI application factory."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from . import __version__
from .api import events as events_api
from .api import intake as intake_api
from .api import notes as notes_api
from .api import projects as projects_api
from .api import settings as settings_api
from .api import state as state_api
from .api import tasks as tasks_api
from .api import today as today_api
from .config import AppSettings, RuntimeOptions
from .context import AppContext
from .security import LocalOnlyMiddleware
from .store.projects import DuplicateName, ProjectNotFound
from .store.tasks import TaskNotFound

STATIC_DIR = Path(__file__).parent / "static"


def _add_error_handlers(app: FastAPI) -> None:
    def respond(status: int, detail: str) -> JSONResponse:
        return JSONResponse({"detail": detail}, status_code=status)

    @app.exception_handler(TaskNotFound)
    async def _task_missing(request: Request, exc: TaskNotFound):
        return respond(404, "Task not found")

    @app.exception_handler(ProjectNotFound)
    async def _project_missing(request: Request, exc: ProjectNotFound):
        return respond(404, "Project not found")

    @app.exception_handler(DuplicateName)
    async def _duplicate(request: Request, exc: DuplicateName):
        return respond(409, f"A project called '{exc.args[0]}' already exists")

    @app.exception_handler(ValueError)
    async def _bad_value(request: Request, exc: ValueError):
        return respond(422, str(exc))


def create_app(
    settings: AppSettings,
    runtime: RuntimeOptions,
    config_path: Path | None = None,
    overrides: dict[str, object] | None = None,
    watch: bool = True,
    static_dir: Path | None = None,
    on_show_window: Callable[[], None] | None = None,
) -> FastAPI:
    static_dir = STATIC_DIR if static_dir is None else static_dir
    ctx = AppContext(settings, runtime, config_path, overrides)
    settings = ctx.settings

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        ctx.bus.bind_loop(asyncio.get_running_loop())
        ctx.refresh()
        if watch:
            ctx.start_watcher()
        try:
            yield
        finally:
            ctx.stop_watcher()

    app = FastAPI(title="ToDoApp", version=__version__, lifespan=lifespan)
    app.state.ctx = ctx
    ports = {p for p in (settings.port, runtime.public_port) if p is not None}
    app.add_middleware(LocalOnlyMiddleware, ports=ports)
    _add_error_handlers(app)
    app.include_router(state_api.router)
    app.include_router(settings_api.router)
    app.include_router(events_api.router)
    for module in (tasks_api, projects_api, notes_api, intake_api, today_api):
        app.include_router(module.router)
    if on_show_window is not None:  # the Windows exe only: a second launch hands its Open here

        def _show_window() -> Response:
            on_show_window()
            return Response(status_code=204)

        app.add_api_route("/api/window/show", _show_window, methods=["POST"], include_in_schema=False)
    @app.api_route(
        "/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], include_in_schema=False
    )
    async def _unknown_api(path: str) -> JSONResponse:
        return JSONResponse({"detail": "not found"}, status_code=404)

    if static_dir.is_dir():  # mounted last so it never shadows /api
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
    return app
