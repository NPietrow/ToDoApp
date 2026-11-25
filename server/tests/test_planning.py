import json
from datetime import date

import pytest

from todoapp.store.planning import PLANNING_UNREADABLE, PlanningLog

D1 = date(2026, 11, 24)
D2 = date(2026, 11, 25)


def test_missing_file_is_empty(tmp_path):
    log = PlanningLog(tmp_path)
    assert log.dates() == []
    assert log.problem() is None
    assert log.path == tmp_path / "log" / "planning.json"


def test_add_creates_file_with_schema(tmp_path):
    log = PlanningLog(tmp_path)
    assert log.add(D2) == [D2]
    assert json.loads(log.path.read_text(encoding="utf-8")) == {
        "schema_version": 1,
        "dates": ["2026-11-25"],
    }


def test_add_is_idempotent_and_sorted(tmp_path):
    log = PlanningLog(tmp_path)
    log.add(D2)
    log.add(D1)
    assert log.add(D2) == [D1, D2]
    assert log.dates() == [D1, D2]


def test_unreadable_file_reported_and_never_overwritten(tmp_path):
    log = PlanningLog(tmp_path)
    log.path.parent.mkdir()
    log.path.write_bytes(b"{not json")
    with pytest.raises(ValueError, match="log/planning.json"):
        log.add(D2)
    assert log.path.read_bytes() == b"{not json"
    assert log.problem().file == "log/planning.json"


def test_newer_schema_left_alone(tmp_path):
    log = PlanningLog(tmp_path)
    log.path.parent.mkdir()
    raw = b'{"schema_version": 2, "dates": []}'
    log.path.write_bytes(raw)
    with pytest.raises(ValueError, match=PLANNING_UNREADABLE):
        log.add(D2)
    assert log.path.read_bytes() == raw
    assert log.problem() is not None
