from datetime import UTC, date, datetime

import pytest

from todoapp.models import Project, new_id, is_uuid
from todoapp.normalise import IntakeError, normalise_task, resolve_project

NOW = datetime(2026, 11, 13, 9, 0, tzinfo=UTC)


def _project(name="Twin Pilot"):
    return Project(id=new_id(), name=name, colour="sage", position=0, status="active", created_at=NOW, closed_at=None)


def test_normalise_intake_minimal_resolves_project_name():
    p = _project()
    t = normalise_task({"title": "Chase Sam", "project": "twin pilot"}, [p], NOW)
    assert t.project_id == p.id and t.task_type == "general" and t.status == "not_started" and is_uuid(t.id)


def test_normalise_unknown_project_is_unsorted_and_bad_values_defaulted():
    t = normalise_task({"title": "x", "project": "Nope", "task_type": "huge", "due_date": "13/11/2026"}, [], NOW)
    assert t.project_id is None and t.task_type == "general" and t.due_date is None


def test_normalise_missing_title_raises():
    with pytest.raises(IntakeError):
        normalise_task({"project": "x"}, [], NOW)


def test_normalise_blank_title_raises():
    with pytest.raises(IntakeError):
        normalise_task({"title": "   "}, [], NOW)


def test_project_id_wins_over_name():
    a, b = _project("A"), _project("B")
    assert resolve_project({"project_id": a.id, "project": "B"}, [a, b]) == a.id
    assert resolve_project({"project_id": new_id(), "project": "B"}, [a, b]) == b.id
    assert resolve_project({}, [a, b]) is None


def test_done_without_completed_at_gets_now_and_bad_id_replaced():
    t = normalise_task({"title": "x", "status": "done", "id": "nope", "bogus": 1, "due_date": "2026-12-01"}, [], NOW)
    assert t.completed_at == NOW and is_uuid(t.id) and t.due_date == date(2026, 12, 1)
