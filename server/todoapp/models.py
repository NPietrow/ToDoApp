"""Data models for tasks and projects (spec section 5.2)."""

from __future__ import annotations

import re
import uuid
from datetime import UTC, date, datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, field_validator

SCHEMA_VERSION = 1


class TaskType(StrEnum):
    URGENT = "urgent"
    QUICK = "quick"
    GENERAL = "general"
    OBJECTIVE = "objective"


class Status(StrEnum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    BLOCKED = "blocked"
    DONE = "done"


def new_id() -> str:
    return str(uuid.uuid4())


def is_uuid(s: str) -> bool:
    try:
        return str(uuid.UUID(s)) == s.lower()
    except (ValueError, AttributeError, TypeError):
        return False


def utcnow() -> datetime:
    return datetime.now(UTC).replace(microsecond=0)


def clean_title(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def _check_title(v: str | None) -> str | None:
    if v is None:
        return v
    cleaned = clean_title(v)
    if not cleaned:
        raise ValueError("title must not be empty")
    return cleaned


class Task(BaseModel):
    schema_version: int = SCHEMA_VERSION
    id: str
    title: str
    description: str | None = None
    project_id: str | None
    task_type: TaskType = TaskType.GENERAL
    status: Status = Status.NOT_STARTED
    status_before_done: Status | None = None
    due_date: date | None = None
    planned_for: date | None = None
    order: int = 0
    today_order: int | None = None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None

    @field_validator("title")
    @classmethod
    def _title(cls, v: str) -> str:
        return _check_title(v)  # type: ignore[return-value]


class Project(BaseModel):
    id: str
    name: str
    colour: str
    position: int
    status: Literal["active", "closed"] = "active"
    created_at: datetime
    closed_at: datetime | None = None


class TaskChanges(BaseModel):
    """Partial update. Use model_fields_set to tell 'set to null' from 'not sent'."""

    title: str | None = None
    description: str | None = None
    project_id: str | None = None
    task_type: TaskType | None = None
    status: Status | None = None
    due_date: date | None = None
    planned_for: date | None = None
    today_order: int | None = None
