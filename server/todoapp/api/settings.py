from __future__ import annotations

import sys
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from pydantic import ValidationError

from ..config import AppSettings
from ..launcher import startup

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
        if ctx.runtime.windows_app and base.start_at_login != ctx.saved_settings.start_at_login:
            # Update the shortcut first: if that fails, nothing is saved or switched.
            try:
                startup.set_start_at_login(base.start_at_login, Path(sys.executable))
            except (OSError, startup.com_error) as e:
                detail = getattr(e, "strerror", None) or str(e)
                raise ValueError(f"Couldn't update the Startup shortcut: {detail}") from e
        if Path(new.data_dir) != Path(old.data_dir):
            try:
                ctx.switch_data_dir(Path(new.data_dir))
            except OSError as e:
                raise HTTPException(422, f"cannot use that folder: {e}") from e
        # A changed port is saved and takes effect on the next start.
        ctx.saved_settings = base
        ctx.overrides = overrides
        ctx.settings = new
        ctx.save_settings()
        return ctx.settings.model_dump(mode="json")
