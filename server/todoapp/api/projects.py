from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel

from ..models import is_uuid
from ..store.projects import ProjectNotFound

router = APIRouter(prefix="/api")


def require_id(project_id: str) -> None:
    """A malformed id can never name a project: 404, not 422."""
    if not is_uuid(project_id):
        raise ProjectNotFound(project_id)


class NewProject(BaseModel):
    name: str
    position: int | None = None


class ProjectPatch(BaseModel):
    name: str | None = None
    colour: str | None = None


class MoveBody(BaseModel):
    position: int


class CloseBody(BaseModel):
    move_open_to: str | None = None


@router.post("/projects", status_code=201)
def create_project(request: Request, body: NewProject) -> dict:
    ctx = request.app.state.ctx
    with ctx.lock:
        project = ctx.projects.create(body.name, body.position)
        ctx.bus.publish()
        return project.model_dump(mode="json")


@router.patch("/projects/{project_id}")
def patch_project(request: Request, project_id: str, body: ProjectPatch) -> dict:
    require_id(project_id)
    ctx = request.app.state.ctx
    with ctx.lock:
        project = ctx.projects.get(project_id)
        if body.name is None and body.colour is None:
            return project.model_dump(mode="json")
        if body.name is not None:
            project = ctx.projects.rename(project_id, body.name)
        if body.colour is not None:
            project = ctx.projects.set_colour(project_id, body.colour)
        ctx.bus.publish()
        return project.model_dump(mode="json")


@router.post("/projects/{project_id}/move")
def move_project(request: Request, project_id: str, body: MoveBody) -> list[dict]:
    require_id(project_id)
    ctx = request.app.state.ctx
    with ctx.lock:
        projects = ctx.projects.move(project_id, body.position)
        ctx.bus.publish()
        return [p.model_dump(mode="json") for p in projects]


@router.post("/projects/{project_id}/close")
def close_project(request: Request, project_id: str, body: CloseBody | None = None) -> dict:
    require_id(project_id)
    ctx = request.app.state.ctx
    target = body.move_open_to if body else None
    with ctx.lock:
        ctx.projects.get(project_id)  # 404 for an unknown project before anything moves
        if target is not None:
            if target == project_id:
                raise ValueError("choose a different project to move the open tasks to")
            if not is_uuid(target):
                raise ValueError(f"invalid project id: {target!r}")
            if ctx.projects.get(target).status != "active":
                raise ValueError("open tasks can only be moved to an active project")
            ctx.tasks.reassign_open(project_id, target)
        project = ctx.projects.close(project_id)
        ctx.bus.publish()
        return project.model_dump(mode="json")


@router.post("/projects/{project_id}/reopen")
def reopen_project(request: Request, project_id: str) -> dict:
    require_id(project_id)
    ctx = request.app.state.ctx
    with ctx.lock:
        project = ctx.projects.reopen(project_id)
        ctx.bus.publish()
        return project.model_dump(mode="json")
