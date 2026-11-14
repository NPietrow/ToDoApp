import json
from pathlib import Path
from datetime import UTC, date, datetime

import pytest

from todoapp.models import Status, TaskChanges, TaskType, new_id
from todoapp.store.tasks import TaskNotFound, TaskRepository


def test_create_appends_to_cell(tmp_path):
    r = TaskRepository(tmp_path); pid = new_id()
    a = r.create("A", pid, TaskType.QUICK); b = r.create("B", pid, TaskType.QUICK)
    assert (a.order, b.order) == (0, 1)
    assert (tmp_path / "tasks" / f"{a.id}.json").exists()


def test_tick_and_untick_restores_previous_status(tmp_path):
    r = TaskRepository(tmp_path); t = r.create("A", new_id())
    r.update(t.id, TaskChanges(status=Status.IN_PROGRESS))
    done = r.set_done(t.id, True)
    assert done.status == "done" and done.completed_at and done.status_before_done == "in_progress"
    back = r.set_done(t.id, False)
    assert back.status == "in_progress" and back.completed_at is None and back.status_before_done is None


def test_update_null_vs_unset(tmp_path):
    r = TaskRepository(tmp_path); t = r.create("A", new_id())
    r.update(t.id, TaskChanges(due_date=date(2026, 11, 20)))
    assert r.update(t.id, TaskChanges(title="B")).due_date == date(2026, 11, 20)
    assert r.update(t.id, TaskChanges(due_date=None)).due_date is None


def test_update_rejects_blank_title(tmp_path):
    r = TaskRepository(tmp_path); t = r.create("A", new_id())
    with pytest.raises(ValueError):
        r.update(t.id, TaskChanges(title="   "))
    assert r.get(t.id).title == "A"


def test_update_status_done_and_back(tmp_path):
    r = TaskRepository(tmp_path); t = r.create("A", new_id())
    d = r.update(t.id, TaskChanges(status=Status.DONE))
    assert d.completed_at and d.status_before_done == "not_started"
    b = r.update(t.id, TaskChanges(status=Status.BLOCKED))
    assert b.status == "blocked" and b.completed_at is None and b.status_before_done is None


def test_update_cell_change_goes_to_end(tmp_path):
    r = TaskRepository(tmp_path); p = new_id()
    r.create("A", p, TaskType.QUICK); b = r.create("B", p, TaskType.QUICK)
    c = r.create("C", p)
    assert r.update(c.id, TaskChanges(task_type=TaskType.QUICK)).order == 2
    assert b.order == 1


def test_all_and_get_stay_current_between_scans(tmp_path):
    r = TaskRepository(tmp_path); r.scan([])
    t = r.create("A", new_id())
    assert [x.id for x in r.all()] == [t.id]
    r.update(t.id, TaskChanges(title="Z"))
    assert r.all()[0].title == "Z"
    r.delete(t.id)
    assert r.all() == []
    r.restore(t.id)
    assert [x.id for x in r.all()] == [t.id]


def test_move_renumbers_target_cell(tmp_path):
    r = TaskRepository(tmp_path); p1, p2 = new_id(), new_id()
    a = r.create("A", p1); b = r.create("B", p2); c = r.create("C", p2)
    r.move(a.id, p2, TaskType.URGENT, 0)
    r.move(b.id, p2, TaskType.URGENT, 1)
    cell = sorted((t for t in r.scan([]).tasks if t.project_id == p2 and t.task_type == "urgent"), key=lambda t: t.order)
    assert [t.title for t in cell] == ["A", "B"] and [t.order for t in cell] == [0, 1]


def test_move_renumbers_source_cell_and_clamps(tmp_path):
    r = TaskRepository(tmp_path); p = new_id(), new_id()
    a = r.create("A", p[0]); b = r.create("B", p[0]); c = r.create("C", p[0])
    r.move(a.id, p[1], TaskType.GENERAL, 99)
    assert (r.get(b.id).order, r.get(c.id).order, r.get(a.id).order) == (0, 1, 0)


def test_delete_restore_empty_trash(tmp_path):
    r = TaskRepository(tmp_path); t = r.create("A", new_id())
    r.delete(t.id)
    assert not (tmp_path / "tasks" / f"{t.id}.json").exists() and (tmp_path / ".trash/tasks" / f"{t.id}.json").exists()
    r.restore(t.id); r.delete(t.id)
    assert r.empty_trash() == 1


def test_reassign_open(tmp_path):
    r = TaskRepository(tmp_path); p1, p2 = new_id(), new_id()
    a = r.create("A", p1); b = r.create("B", p1); r.set_done(b.id, True)
    c = r.create("C", p2)
    assert r.reassign_open(p1, p2) == 1
    assert r.get(a.id).project_id == p2 and r.get(a.id).order == 1
    assert r.get(b.id).project_id == p1 and r.get(c.id).order == 0


def test_scan_normalises_hand_written_file_with_any_name(tmp_path):
    (tmp_path / "tasks").mkdir(parents=True)
    (tmp_path / "tasks" / "from-copilot.json").write_text('{"title": "Hand made"}', encoding="utf-8")
    res = TaskRepository(tmp_path).scan([])
    assert [t.title for t in res.tasks] == ["Hand made"] and res.problems == []
    assert not (tmp_path / "tasks" / "from-copilot.json").exists()
    assert (tmp_path / "tasks" / f"{res.tasks[0].id}.json").exists()


def test_reads_bom_file(tmp_path):
    r = TaskRepository(tmp_path); t = r.create("A", new_id())
    f = tmp_path / "tasks" / f"{t.id}.json"
    f.write_bytes(b"\xef\xbb\xbf" + f.read_bytes().replace(b"\n", b"\r\n"))
    assert TaskRepository(tmp_path).scan([]).problems == []


def test_problem_clears_when_file_fixed(tmp_path):
    (tmp_path / "tasks").mkdir(parents=True); f = tmp_path / "tasks" / "half.json"
    f.write_text('{"title": "x"', encoding="utf-8")
    r = TaskRepository(tmp_path)
    assert [p.file for p in r.scan([]).problems] == ["tasks/half.json"] and f.read_text() == '{"title": "x"'
    f.write_text('{"title": "x"}', encoding="utf-8")
    assert r.scan([]).problems == []


def test_missing_title_is_problem_and_file_kept(tmp_path):
    (tmp_path / "tasks").mkdir(parents=True); f = tmp_path / "tasks" / "no-title.json"
    f.write_text('{"project": "x"}', encoding="utf-8")
    res = TaskRepository(tmp_path).scan([])
    assert res.tasks == [] and len(res.problems) == 1 and f.exists()


def test_get_rejects_non_uuid(tmp_path):
    with pytest.raises(TaskNotFound):
        TaskRepository(tmp_path).get("../../etc")


def _hand_file(tmp_path, name="from-copilot.json"):
    (tmp_path / "tasks").mkdir(parents=True, exist_ok=True)
    f = tmp_path / "tasks" / name
    f.write_text('{"title": "Hand made"}', encoding="utf-8")
    return f


def test_unlink_failure_leaves_no_duplicate_and_retries(tmp_path, monkeypatch):
    f = _hand_file(tmp_path)
    real = Path.unlink

    def locked(self, *a, **k):
        if self.name == "from-copilot.json":
            raise PermissionError("locked")
        return real(self, *a, **k)

    monkeypatch.setattr(Path, "unlink", locked)
    r = TaskRepository(tmp_path)
    for _ in range(3):
        res = r.scan([])
        assert res.tasks == [] and [p.file for p in res.problems] == ["tasks/from-copilot.json"]
    assert sorted(p.name for p in (tmp_path / "tasks").glob("*.json")) == ["from-copilot.json"]
    monkeypatch.undo()
    res = r.scan([])
    assert [t.title for t in res.tasks] == ["Hand made"] and res.problems == []
    assert not f.exists() and len(list((tmp_path / "tasks").glob("*.json"))) == 1


def test_write_failure_problem_is_not_cached(tmp_path, monkeypatch):
    f = _hand_file(tmp_path)
    r = TaskRepository(tmp_path)

    def boom(*a, **k):
        raise OSError("disk full")

    monkeypatch.setattr("todoapp.store.tasks.atomic_write_json", boom)
    assert len(r.scan([]).problems) == 1 and f.exists()
    monkeypatch.undo()
    res = r.scan([])
    assert res.problems == [] and [t.title for t in res.tasks] == ["Hand made"]


def test_delete_never_overwrites_earlier_trashed_copy(tmp_path):
    r = TaskRepository(tmp_path); t = r.create("A", new_id())
    original = (tmp_path / "tasks" / f"{t.id}.json").read_text(encoding="utf-8")
    r.delete(t.id)
    # a hand-dropped file reusing the trashed id
    (tmp_path / "tasks" / f"{t.id}.json").write_text(original.replace('"A"', '"B"'), encoding="utf-8")
    r2 = TaskRepository(tmp_path); r2.scan([])
    r2.delete(t.id)
    trashed = list((tmp_path / ".trash" / "tasks").glob("*.json"))
    assert len(trashed) == 2
    assert {json.loads(p.read_text(encoding="utf-8"))["title"] for p in trashed} == {"A", "B"}
    assert r2.restore(t.id).title == "B"
    assert r2.empty_trash() == 1


def _newer_file(tmp_path, id):
    (tmp_path / "tasks").mkdir(parents=True, exist_ok=True)
    f = tmp_path / "tasks" / f"{id}.json"
    raw = {"schema_version": 2, "id": id, "title": "From the future", "project_id": None,
           "task_type": "general", "status": "not_started", "colour_tag": "teal"}
    f.write_text(json.dumps(raw), encoding="utf-8")
    return f


def test_newer_schema_file_is_reported_and_never_written(tmp_path, monkeypatch):
    id = new_id()
    f = _newer_file(tmp_path, id)
    other = tmp_path / "tasks" / "renamed-by-hand.json"
    other.write_text('{"schema_version": 3, "title": "Also newer"}', encoding="utf-8")
    before = {p.name: p.read_bytes() for p in (tmp_path / "tasks").iterdir()}

    r = TaskRepository(tmp_path)
    # writes before the first scan must not load it either
    r.create("Today's task", None)
    with pytest.raises(TaskNotFound):
        r.update(id, TaskChanges(title="x"))
    with pytest.raises(TaskNotFound):
        r.move(id, new_id(), TaskType.QUICK, 0)
    res = r.scan([])
    assert [t.title for t in res.tasks] == ["Today's task"]
    assert sorted((p.file, p.error) for p in res.problems) == sorted([
        ("tasks/renamed-by-hand.json", "written by a newer version of ToDoApp"),
        (f"tasks/{id}.json", "written by a newer version of ToDoApp"),
    ])
    # cached until the file changes: the next scan doesn't even re-read it
    import todoapp.store.tasks as tasks_mod

    reads = []
    real = tasks_mod.read_json
    monkeypatch.setattr(tasks_mod, "read_json", lambda p: (reads.append(p), real(p))[1])
    assert len(r.scan([]).problems) == 2 and reads == []
    with pytest.raises(TaskNotFound):
        r.update(id, TaskChanges(title="x"))
    after = {p.name: p.read_bytes() for p in (tmp_path / "tasks").iterdir() if p.name in before}
    assert after == before and f.exists() and other.exists()


def test_locked_task_file_is_retried_on_the_next_scan(tmp_path, monkeypatch):
    r = TaskRepository(tmp_path); t = r.create("Locked a moment", None)
    import todoapp.store.tasks as tasks_mod

    real = tasks_mod.read_json
    calls = {"n": 0}

    def once(path):
        calls["n"] += 1
        if calls["n"] == 1:
            raise PermissionError("The process cannot access the file")
        return real(path)

    monkeypatch.setattr(tasks_mod, "read_json", once)
    r2 = TaskRepository(tmp_path)
    first = r2.scan([])
    assert first.tasks == [] and [p.file for p in first.problems] == [f"tasks/{t.id}.json"]
    res = r2.scan([])  # the file is unchanged, but a transient problem isn't cached
    assert [x.id for x in res.tasks] == [t.id] and res.problems == []


def test_bad_json_stays_cached_until_the_file_changes(tmp_path, monkeypatch):
    (tmp_path / "tasks").mkdir(parents=True); f = tmp_path / "tasks" / "bad.json"
    f.write_text("{nope", encoding="utf-8")
    r = TaskRepository(tmp_path)
    assert len(r.scan([]).problems) == 1
    import todoapp.store.tasks as tasks_mod

    monkeypatch.setattr(tasks_mod, "read_json", lambda p: pytest.fail("re-read a cached bad file"))
    assert len(r.scan([]).problems) == 1


def test_hand_edited_file_keeps_a_closed_projects_id(tmp_path):
    from todoapp.models import Project, utcnow

    closed = Project(id=new_id(), name="Old Job", colour="sage", position=0, status="closed",
                     created_at=utcnow(), closed_at=utcnow())
    (tmp_path / "tasks").mkdir(parents=True)
    (tmp_path / "tasks" / "hand.json").write_text(
        json.dumps({"title": "Kept", "project_id": closed.id}), encoding="utf-8"
    )
    res = TaskRepository(tmp_path).scan([], known=[closed])
    assert [(t.title, t.project_id) for t in res.tasks] == [("Kept", closed.id)]
    # an id nobody knows is still dropped
    (tmp_path / "tasks" / "hand2.json").write_text(
        json.dumps({"title": "Lost", "project_id": new_id()}), encoding="utf-8"
    )
    res = TaskRepository(tmp_path).scan([], known=[closed])
    assert {t.title: t.project_id for t in res.tasks}["Lost"] is None
