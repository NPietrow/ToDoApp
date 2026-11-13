from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from pydantic import ValidationError

from ..config import AppSettings

router = APIRouter(prefix="/api")


@router.patch("/settings")
def patch_settings(request: Request, patch: dict) -> dict:
    ctx = request.app.state.ctx
    unknown = sorted(set(patch) - set(AppSettings.model_fields))
    if unknown:
        raise HTTPException(422, f"unknown settings: {', '.join(unknown)}")
    with ctx.lock:
        old = ctx.settings
        try:
            base = AppSettings.model_validate({**ctx.saved_settings.model_dump(), **patch})
            # A key the user sets explicitly stops being a run override.
            overrides = {k: v for k, v in ctx.overrides.items() if k not in patch}
            new = ctx.effective(base, overrides)
        except ValidationError as e:
            raise HTTPException(
                422, jsonable_encoder(e.errors(include_url=False, include_context=False, include_input=False))
            ) from e
        if Path(new.data_dir) != Path(old.data_dir):
            try:
                ctx.switch_data_dir(Path(new.data_dir))
            except OSError as e:
                raise HTTPException(422, f"cannot use that folder: {e}") from e
        # A changed port is saved and takes effect on the next start.
        # Task 18 wires start_at_login to launcher.startup here when runtime.windows_app.
        ctx.saved_settings = base
        ctx.overrides = overrides
        ctx.settings = new
        ctx.save_settings()
        return ctx.settings.model_dump(mode="json")
