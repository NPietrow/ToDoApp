from __future__ import annotations

from fastapi import APIRouter, Body, Request, Response
from pydantic import BaseModel

from ..models import TaskChanges, TaskType

router = APIRouter(prefix="/api")


class NewTask(BaseModel):
    title: str
    project_id: str | None = None  # null / absent = Unsorted
    task_type: TaskType = TaskType.GENERAL


class DoneBody(BaseModel):
    done: bool


class MoveBody(BaseModel):
    project_id: str | None = None
    task_type: TaskType
    index: int = 0


@router.post("/tasks", status_code=201)
def create_task(request: Request, body: NewTask) -> dict:
    ctx = request.app.state.ctx
    with ctx.lock:
        task = ctx.tasks.create(body.title, body.project_id, body.task_type)
        ctx.bus.publish()
        return task.model_dump(mode="json")


@router.patch("/tasks/{task_id}")
def patch_task(request: Request, task_id: str, body: dict = Body(...)) -> dict:
    ctx = request.app.state.ctx
    changes = TaskChanges.model_validate(body)  # keeps "sent as null" apart from "not sent"
    with ctx.lock:
        task = ctx.tasks.update(task_id, changes)
        ctx.bus.publish()
        return task.model_dump(mode="json")


@router.post("/tasks/{task_id}/done")
def set_done(request: Request, task_id: str, body: DoneBody) -> dict:
    ctx = request.app.state.ctx
    with ctx.lock:
        task = ctx.tasks.set_done(task_id, body.done)
        ctx.bus.publish()
        return task.model_dump(mode="json")


@router.post("/tasks/{task_id}/move")
def move_task(request: Request, task_id: str, body: MoveBody) -> list[dict]:
    ctx = request.app.state.ctx
    with ctx.lock:
        cell = ctx.tasks.move(task_id, body.project_id, body.task_type, body.index)
        ctx.bus.publish()
        return [t.model_dump(mode="json") for t in cell]


@router.delete("/tasks/{task_id}", status_code=204)
def delete_task(request: Request, task_id: str) -> Response:
    ctx = request.app.state.ctx
    with ctx.lock:
        ctx.tasks.delete(task_id)
        ctx.bus.publish()
    return Response(status_code=204)


@router.post("/tasks/{task_id}/restore")
def restore_task(request: Request, task_id: str) -> dict:
    ctx = request.app.state.ctx
    with ctx.lock:
        task = ctx.tasks.restore(task_id)
        ctx.bus.publish()
        return task.model_dump(mode="json")


@router.post("/trash/empty")
def empty_trash(request: Request) -> dict:
    ctx = request.app.state.ctx
    with ctx.lock:
        removed = ctx.tasks.empty_trash()
        ctx.bus.publish()
        return {"removed": removed}
