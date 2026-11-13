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
    assert n.all([a, b]) == {a: "hello", b: ""}
    with pytest.raises(ValueError):
        n.all([a, "nope"])


def test_stored_with_lf_in_notes_folder(tmp_path):
    n = NotesRepository(tmp_path); pid = new_id()
    n.put(pid, "x\r\ny")
    assert (tmp_path / "notes" / f"{pid}.txt").read_bytes() == b"x\ny"
