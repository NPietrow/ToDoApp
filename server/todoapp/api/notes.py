from __future__ import annotations

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel

from .projects import require_id

router = APIRouter(prefix="/api")


class NotesBody(BaseModel):
    text: str


@router.put("/notes/{project_id}", status_code=204)
def put_notes(request: Request, project_id: str, body: NotesBody) -> Response:
    require_id(project_id)
    ctx = request.app.state.ctx
    with ctx.lock:
        ctx.projects.get(project_id)  # unknown project -> 404
        ctx.notes.put(project_id, body.text)
        ctx.bus.publish()
    return Response(status_code=204)
