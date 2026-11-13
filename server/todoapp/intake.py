"""Lenient intake: pull task items out of pasted text, preview them, import them."""

from __future__ import annotations

import json
import re
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime

from .models import Project, Task
from .normalise import IntakeError, normalise_task
from .store.tasks import TaskRepository


@dataclass
class PreviewItem:
    title: str
    project_id: str | None
    project_name: str | None
    task_type: str
    due_date: str | None


@dataclass
class Preview:
    items: list[PreviewItem] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


def _as_items(value: object) -> list[dict]:
    if isinstance(value, dict):
        tasks = value.get("tasks")
        items = tasks if isinstance(tasks, list) else [value]
    elif isinstance(value, list):
        items = value
    else:
        raise IntakeError("no tasks found")
    return [i if isinstance(i, dict) else {} for i in items]


def extract_items(text: str) -> list[dict]:
    candidates = [text.strip()] + re.findall(r"```(?:json)?\s*(.*?)```", text, re.S)
    for c in candidates:
        try:
            return _as_items(json.loads(c))
        except (json.JSONDecodeError, IntakeError):
            pass
    dec = json.JSONDecoder()
    for m in re.finditer(r"[\[{]", text):  # first decodable JSON value embedded in prose
        try:
            return _as_items(dec.raw_decode(text, m.start())[0])
        except (json.JSONDecodeError, IntakeError):
            continue
    raise IntakeError("no tasks found")


def normalise_items(
    items: Sequence[dict], active: Sequence[Project], now: datetime
) -> tuple[list[Task], list[str]]:
    """Valid tasks (not yet stored) and 'Item n: reason' errors for the rest."""
    tasks: list[Task] = []
    errors: list[str] = []
    for n, raw in enumerate(items, start=1):
        try:
            tasks.append(normalise_task(raw, active, now))
        except IntakeError as e:
            errors.append(f"Item {n}: {e}")
    return tasks, errors


def preview(text: str, active: Sequence[Project], now: datetime) -> Preview:
    tasks, errors = normalise_items(extract_items(text), active, now)
    names = {p.id: p.name for p in active}
    return Preview(
        items=[
            PreviewItem(
                title=t.title,
                project_id=t.project_id,
                project_name=names.get(t.project_id) if t.project_id else None,
                task_type=t.task_type.value,
                due_date=t.due_date.isoformat() if t.due_date else None,
            )
            for t in tasks
        ],
        errors=errors,
    )


def import_text(text: str, tasks: TaskRepository, active: Sequence[Project], now: datetime) -> list[Task]:
    valid, _ = normalise_items(extract_items(text), active, now)
    return [tasks.add(t) for t in valid]
