from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Request
from pydantic import BaseModel

from .. import intake
from ..context import PROJECTS_UNREADABLE
from ..models import utcnow

router = APIRouter(prefix="/api/intake")


class TextBody(BaseModel):
    text: str


def _active_projects(ctx):
    projects, problem = ctx.read_projects()
    if problem is not None:
        raise ValueError(PROJECTS_UNREADABLE)  # importing now would lose project assignments
    return [p for p in projects if p.status == "active"]


@router.post("/preview")
def preview(request: Request, body: TextBody) -> dict:
    ctx = request.app.state.ctx
    with ctx.lock:
        result = intake.preview(body.text, _active_projects(ctx), utcnow())
    return {"items": [asdict(i) for i in result.items], "errors": result.errors}


@router.post("/import")
def import_tasks(request: Request, body: TextBody) -> dict:
    ctx = request.app.state.ctx
    with ctx.lock:
        valid, errors = intake.normalise_items(
            intake.extract_items(body.text), _active_projects(ctx), utcnow()
        )
        imported = [ctx.tasks.add(t) for t in valid]
        if imported:
            ctx.bus.publish()
    return {"imported": [t.model_dump(mode="json") for t in imported], "errors": errors}
