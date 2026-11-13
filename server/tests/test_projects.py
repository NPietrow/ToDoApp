import pytest

from todoapp.store.projects import DuplicateName, ProjectNotFound, ProjectRepository


def test_create_assigns_next_colour_and_appends(tmp_path):
    r = ProjectRepository(tmp_path)
    a = r.create("Twin Pilot"); b = r.create("Data Platform")
    assert (a.colour, b.colour) == ("sage", "lavender")
    assert [p.name for p in r.active()] == ["Twin Pilot", "Data Platform"]


def test_insert_at_position_shifts_others(tmp_path):
    r = ProjectRepository(tmp_path); r.create("A"); r.create("C")
    r.create("B", position=1)
    assert [p.name for p in r.active()] == ["A", "B", "C"]
    assert [p.position for p in r.active()] == [0, 1, 2]


def test_active_names_unique_case_insensitive(tmp_path):
    r = ProjectRepository(tmp_path); r.create("Digital Twin")
    with pytest.raises(DuplicateName):
        r.create("digital twin")


def test_closed_name_can_be_reused_as_new_project(tmp_path):
    r = ProjectRepository(tmp_path); old = r.create("Digital Twin"); r.close(old.id)
    new = r.create("Digital Twin")
    assert new.id != old.id and r.get(old.id).status == "closed" and r.get(old.id).closed_at


def test_reopen_conflicting_name_raises(tmp_path):
    r = ProjectRepository(tmp_path); old = r.create("X"); r.close(old.id); r.create("X")
    with pytest.raises(DuplicateName):
        r.reopen(old.id)


def test_reopen_goes_to_end(tmp_path):
    r = ProjectRepository(tmp_path); a = r.create("A"); r.create("B")
    r.close(a.id)
    reopened = r.reopen(a.id)
    assert reopened.status == "active" and reopened.closed_at is None
    assert [p.name for p in r.active()] == ["B", "A"]


def test_move_and_persist(tmp_path):
    r = ProjectRepository(tmp_path); a = r.create("A"); r.create("B"); r.create("C")
    r.move(a.id, 2)
    assert [p.name for p in ProjectRepository(tmp_path).active()] == ["B", "C", "A"]


def test_rename_checks_duplicates_and_persists(tmp_path):
    r = ProjectRepository(tmp_path); a = r.create("A"); r.create("B")
    with pytest.raises(DuplicateName):
        r.rename(a.id, " b ")
    assert r.rename(a.id, "A2").name == "A2"
    assert r.rename(a.id, "a2").name == "a2"  # own name, new case, is fine
    assert ProjectRepository(tmp_path).get(a.id).name == "a2"


def test_set_colour(tmp_path):
    r = ProjectRepository(tmp_path); a = r.create("A")
    assert r.set_colour(a.id, "rose").colour == "rose"
    with pytest.raises(ValueError):
        r.set_colour(a.id, "neon")


def test_unknown_and_bad_ids(tmp_path):
    r = ProjectRepository(tmp_path)
    with pytest.raises(ProjectNotFound):
        r.get("00000000-0000-4000-8000-000000000000")
    with pytest.raises(ValueError):
        r.get("../x")


def test_file_format_and_corrupt_file_not_deleted(tmp_path):
    r = ProjectRepository(tmp_path); r.create("A")
    import json
    data = json.loads((tmp_path / "projects.json").read_text(encoding="utf-8"))
    assert data["schema_version"] == 1 and data["projects"][0]["name"] == "A"
    (tmp_path / "projects.json").write_text("{not json", encoding="utf-8")
    with pytest.raises(Exception):
        ProjectRepository(tmp_path).list()
    assert (tmp_path / "projects.json").read_text(encoding="utf-8") == "{not json"
