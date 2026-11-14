"""Turn full-schema or lenient intake dicts into valid Task objects (spec 5.3)."""

from __future__ import annotations

import re
from collections.abc import Sequence
from datetime import UTC, date, datetime
from typing import Any

from .models import Project, Status, Task, TaskType, clean_title, is_uuid, new_id

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class IntakeError(ValueError):
    pass


def resolve_project(
    raw: dict, active: Sequence[Project], known: Sequence[Project] | None = None
) -> str | None:
    """project_id wins if it names a project in `known` (default: `active`, the intake rule);
    else match `project` by name against active projects."""
    pid = raw.get("project_id")
    if isinstance(pid, str):
        for p in known if known is not None else active:
            if p.id == pid.lower():
                return p.id
    name = raw.get("project")
    if isinstance(name, str) and name.strip():
        key = name.strip().casefold()
        for p in active:
            if p.name.strip().casefold() == key:
                return p.id
    return None


def _enum(value: Any, enum_cls, default):
    if isinstance(value, str):
        try:
            return enum_cls(value.strip().lower())
        except ValueError:
            pass
    return default


def _date(value: Any) -> date | None:
    if isinstance(value, str) and _DATE_RE.match(value.strip()):
        try:
            return date.fromisoformat(value.strip())
        except ValueError:
            return None
    return None


def _datetime(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        dt = datetime.fromisoformat(value.strip())
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def _int(value: Any) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def normalise_task(
    raw: dict, active: Sequence[Project], now: datetime, known: Sequence[Project] | None = None
) -> Task:
    """Intake (inbox, paste) passes no `known`: only an active project's id is kept. A
    hand-edited file in tasks/ passes every project, so a link to a closed one survives."""
    title = raw.get("title")
    if not isinstance(title, str) or not clean_title(title):
        raise IntakeError("missing title")

    status = _enum(raw.get("status"), Status, Status.NOT_STARTED)
    before = _enum(raw.get("status_before_done"), Status, None)
    if before == Status.DONE:
        before = None
    completed_at = _datetime(raw.get("completed_at"))
    if status == Status.DONE and completed_at is None:
        completed_at = now
    if status != Status.DONE:
        completed_at, before = None, None

    raw_id = raw.get("id")
    description = raw.get("description")
    return Task(
        id=raw_id.lower() if isinstance(raw_id, str) and is_uuid(raw_id.lower()) else new_id(),
        title=title,
        description=description if isinstance(description, str) and description.strip() else None,
        project_id=resolve_project(raw, active, known),
        task_type=_enum(raw.get("task_type"), TaskType, TaskType.GENERAL),
        status=status,
        status_before_done=before,
        due_date=_date(raw.get("due_date")),
        planned_for=_date(raw.get("planned_for")),
        order=_int(raw.get("order")) or 0,
        today_order=_int(raw.get("today_order")),
        created_at=_datetime(raw.get("created_at")) or now,
        updated_at=_datetime(raw.get("updated_at")) or now,
        completed_at=completed_at,
    )
