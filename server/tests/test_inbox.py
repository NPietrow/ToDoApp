from datetime import UTC, datetime

from todoapp.inbox import process_inbox
from todoapp.store.tasks import TaskRepository

NOW = datetime(2026, 11, 13, 9, 0, tzinfo=UTC)

CHATTY = 'Sure! Here are your tasks:\n```json\n{"tasks": [{"title": "Send NDA", "project": "Line 4 Bid"}, {"title": "Book room"}]}\n```\nAnything else?'


def test_inbox_imports_and_moves_file(tmp_path):
    (tmp_path / "inbox").mkdir()
    (tmp_path / "inbox" / "meeting.json").write_text(CHATTY.split("```json\n")[1].split("\n```")[0])
    res = process_inbox(tmp_path, TaskRepository(tmp_path), [], NOW)
    assert res.imported == 2 and res.problems == []
    assert not (tmp_path / "inbox" / "meeting.json").exists()
    assert [f.name for f in (tmp_path / "inbox/processed").iterdir()] == ["20261113-090000-meeting.json"]


def test_inbox_bad_file_left_and_reported(tmp_path):
    (tmp_path / "inbox").mkdir()
    (tmp_path / "inbox" / "bad.json").write_text("{oops")
    res = process_inbox(tmp_path, TaskRepository(tmp_path), [], NOW)
    assert res.imported == 0 and [p.file for p in res.problems] == ["inbox/bad.json"]
    assert (tmp_path / "inbox" / "bad.json").exists()


def test_inbox_partial_file_imports_valid_items_and_reports_rest(tmp_path):
    (tmp_path / "inbox").mkdir()
    (tmp_path / "inbox" / "mix.json").write_text('[{"title": "a"}, {"project": "x"}]')
    res = process_inbox(tmp_path, TaskRepository(tmp_path), [], NOW)
    assert res.imported == 1
    assert [(p.file, p.error) for p in res.problems] == [("inbox/mix.json", "Item 2: missing title")]
    assert not (tmp_path / "inbox" / "mix.json").exists()
    assert len(list((tmp_path / "inbox/processed").iterdir())) == 1


def test_inbox_all_invalid_items_file_stays(tmp_path):
    (tmp_path / "inbox").mkdir()
    (tmp_path / "inbox" / "none.json").write_text('[{"x": 1}]')
    res = process_inbox(tmp_path, TaskRepository(tmp_path), [], NOW)
    assert res.imported == 0 and len(res.problems) == 1
    assert (tmp_path / "inbox" / "none.json").exists()


def test_inbox_processed_name_never_overwrites(tmp_path):
    inbox = tmp_path / "inbox"
    (inbox / "processed").mkdir(parents=True)
    (inbox / "processed" / "20261113-090000-a.json").write_text("old")
    (inbox / "a.json").write_text('{"title": "x"}')
    process_inbox(tmp_path, TaskRepository(tmp_path), [], NOW)
    names = sorted(f.name for f in (inbox / "processed").iterdir())
    assert names == ["20261113-090000-a-1.json", "20261113-090000-a.json"]
    assert (inbox / "processed" / "20261113-090000-a.json").read_text() == "old"


def test_inbox_handles_bom_skips_temp_and_ignores_processed_and_other_files(tmp_path):
    inbox = tmp_path / "inbox"
    (inbox / "processed").mkdir(parents=True)
    (inbox / "bom.json").write_bytes(b"\xef\xbb\xbf" + b'{"title": "x"}')
    (inbox / "half.json.tmp").write_text("{")
    (inbox / "notes.txt").write_text("hi")
    (inbox / "processed" / "old.json").write_text('{"title": "y"}')
    res = process_inbox(tmp_path, TaskRepository(tmp_path), [], NOW)
    assert res.imported == 1 and res.problems == []
    assert (inbox / "half.json.tmp").exists() and (inbox / "notes.txt").exists()
    assert (inbox / "processed" / "old.json").exists()


def test_inbox_missing_folder_is_fine(tmp_path):
    res = process_inbox(tmp_path, TaskRepository(tmp_path), [], NOW)
    assert res.imported == 0 and res.problems == []
