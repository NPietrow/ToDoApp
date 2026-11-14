import pytest

from todoapp.models import new_id
from todoapp.store.notes import NotesRepository


def test_notes_round_trip_and_bad_id(tmp_path):
    n = NotesRepository(tmp_path); pid = new_id()
    assert n.get(pid) == ""
    n.put(pid, "- a\r\n- b"); assert n.get(pid) == "- a\n- b"
    with pytest.raises(ValueError):
        n.put("../x", "boom")
    with pytest.raises(ValueError):
        n.get("../x")


def test_all_returns_requested_ids(tmp_path):
    n = NotesRepository(tmp_path); a, b = new_id(), new_id()
    n.put(a, "hello")
    assert n.all([a, b]) == ({a: "hello", b: ""}, [])
    with pytest.raises(ValueError):
        n.all([a, "nope"])


def test_unreadable_notes_are_reported_per_file_and_never_overwritten(tmp_path):
    n = NotesRepository(tmp_path); good, bad = new_id(), new_id()
    n.put(good, "fine")
    f = tmp_path / "notes" / f"{bad}.txt"
    f.write_bytes("café £5".encode("cp1252"))  # saved as ANSI by another editor
    texts, problems = n.all([good, bad])
    assert texts == {good: "fine", bad: ""}
    assert [p.file for p in problems] == [f"notes/{bad}.txt"]
    with pytest.raises(ValueError, match="can't be read"):
        n.put(bad, "overwrite")
    assert f.read_bytes() == "café £5".encode("cp1252")


def test_locked_notes_file_is_a_problem_not_an_error(tmp_path, monkeypatch):
    from pathlib import Path

    n = NotesRepository(tmp_path); pid = new_id()
    n.put(pid, "x")
    real = Path.read_bytes

    def locked(self):
        if self.name == f"{pid}.txt":
            raise PermissionError("in use")
        return real(self)

    monkeypatch.setattr(Path, "read_bytes", locked)
    texts, problems = n.all([pid])
    assert texts == {pid: ""} and "in use" in problems[0].error
    with pytest.raises(ValueError):
        n.put(pid, "y")
    monkeypatch.undo()
    assert n.all([pid]) == ({pid: "x"}, [])


def test_stored_with_lf_in_notes_folder(tmp_path):
    n = NotesRepository(tmp_path); pid = new_id()
    n.put(pid, "x\r\ny")
    assert (tmp_path / "notes" / f"{pid}.txt").read_bytes() == b"x\ny"
