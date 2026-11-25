from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter(prefix="/api")


class ReorderBody(BaseModel):
    date: date
    ids: list[str]


@router.post("/today/reorder")
def reorder_today(request: Request, body: ReorderBody) -> list[dict]:
    ctx = request.app.state.ctx
    with ctx.lock:
        tasks = ctx.tasks.reorder_today(body.date, body.ids)
        ctx.bus.publish()
        return [t.model_dump(mode="json") for t in tasks]
