from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter(prefix="/api")


class ReorderBody(BaseModel):
    date: dt.date
    ids: list[str]


class PlanningBody(BaseModel):
    date: dt.date


@router.post("/today/reorder")
def reorder_today(request: Request, body: ReorderBody) -> list[dict]:
    ctx = request.app.state.ctx
    with ctx.lock:
        tasks = ctx.tasks.reorder_today(body.date, body.ids)
        ctx.bus.publish()
        return [t.model_dump(mode="json") for t in tasks]


@router.post("/planning")
def record_planning(request: Request, body: PlanningBody) -> dict:
    ctx = request.app.state.ctx
    with ctx.lock:
        days = ctx.planning.add(body.date)
        return {"dates": [d.isoformat() for d in days]}
