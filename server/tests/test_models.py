from datetime import date

import pytest
from pydantic import ValidationError

from todoapp.models import Status, Task, TaskType, is_uuid, new_id, utcnow


def test_task_defaults():
    t = Task(id=new_id(), title="  Chase\nSam  ", project_id=None,
             created_at=utcnow(), updated_at=utcnow())
    assert t.title == "Chase Sam"
    assert t.task_type == TaskType.GENERAL and t.status == Status.NOT_STARTED
    assert t.schema_version == 1 and t.completed_at is None and t.order == 0


def test_blank_title_rejected():
    with pytest.raises(ValidationError):
        Task(id=new_id(), title=" \n ", project_id=None, created_at=utcnow(), updated_at=utcnow())


def test_task_json_round_trip_uses_spec_field_names():
    t = Task(id=new_id(), title="x", project_id=None, due_date=date(2026, 11, 13),
             created_at=utcnow(), updated_at=utcnow())
    d = t.model_dump(mode="json")
    assert set(d) == {"schema_version", "id", "title", "description", "project_id", "task_type",
                      "status", "status_before_done", "due_date", "planned_for", "order",
                      "today_order", "created_at", "updated_at", "completed_at"}
    assert d["due_date"] == "2026-11-13"


def test_is_uuid():
    assert is_uuid(new_id()) and not is_uuid("../etc/passwd") and not is_uuid("abc")
