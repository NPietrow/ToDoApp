from __future__ import annotations

from fastapi import APIRouter, Request

from .. import __version__

router = APIRouter(prefix="/api")


@router.get("/health")
def health() -> dict:
    return {"app": "todoapp", "version": __version__}


@router.get("/state")
def state(request: Request) -> dict:
    ctx = request.app.state.ctx
    with ctx.lock:
        projects = ctx.projects.list()
        scan = ctx.tasks.scan([p for p in projects if p.status == "active"])
        problems = [*scan.problems, *ctx.inbox_problems]
        return {
            "projects": [p.model_dump(mode="json") for p in projects],
            "tasks": [t.model_dump(mode="json") for t in scan.tasks],
            "notes": ctx.notes.all(p.id for p in projects),
            "problems": [{"file": p.file, "error": p.error} for p in problems],
            "settings": ctx.settings.model_dump(mode="json"),
            "windows_app": ctx.runtime.windows_app,
        }
