from datetime import UTC, datetime

from todoapp.inbox import process_inbox
from todoapp.store.tasks import TaskRepository

NOW = datetime(2026, 11, 13, 9, 0, tzinfo=UTC)
STAMP = NOW.astimezone().strftime("%Y%m%d-%H%M%S")  # processed names use local time (R8)

CHATTY = 'Sure! Here are your tasks:\n```json\n{"tasks": [{"title": "Send NDA", "project": "Line 4 Bid"}, {"title": "Book room"}]}\n```\nAnything else?'


def test_inbox_imports_and_moves_file(tmp_path):
    (tmp_path / "inbox").mkdir()
    (tmp_path / "inbox" / "meeting.json").write_text(CHATTY.split("```json\n")[1].split("\n```")[0])
    res = process_inbox(tmp_path, TaskRepository(tmp_path), [], NOW)
    assert res.imported == 2 and res.problems == []
    assert not (tmp_path / "inbox" / "meeting.json").exists()
    assert [f.name for f in (tmp_path / "inbox/processed").iterdir()] == [f"{STAMP}-meeting.json"]


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
    assert res.imported == 1 and res.problems == []
    # the skipped item points at the processed file, where the user can find it
    processed = f"inbox/processed/{STAMP}-mix.json"
    assert [(p.file, p.error) for p in res.skipped] == [(processed, "Item 2: missing title")]
    assert not (tmp_path / "inbox" / "mix.json").exists()
    assert (tmp_path / processed).is_file()


def test_inbox_processed_stamp_is_local_time(tmp_path):
    summer = datetime(2026, 7, 1, 12, 0, tzinfo=UTC)  # 13:00 in British Summer Time
    (tmp_path / "inbox").mkdir()
    (tmp_path / "inbox" / "a.json").write_text('{"title": "x"}')
    repo = TaskRepository(tmp_path)
    process_inbox(tmp_path, repo, [], summer)
    local = summer.astimezone().strftime("%Y%m%d-%H%M%S")
    assert [f.name for f in (tmp_path / "inbox/processed").iterdir()] == [f"{local}-a.json"]
    # task timestamps stay in UTC
    assert repo.scan([]).tasks[0].created_at == summer


def test_inbox_all_invalid_items_file_stays(tmp_path):
    (tmp_path / "inbox").mkdir()
    (tmp_path / "inbox" / "none.json").write_text('[{"x": 1}]')
    res = process_inbox(tmp_path, TaskRepository(tmp_path), [], NOW)
    assert res.imported == 0 and len(res.problems) == 1
    assert (tmp_path / "inbox" / "none.json").exists()


def test_inbox_processed_name_never_overwrites(tmp_path):
    inbox = tmp_path / "inbox"
    (inbox / "processed").mkdir(parents=True)
    (inbox / "processed" / f"{STAMP}-a.json").write_text("old")
    (inbox / "a.json").write_text('{"title": "x"}')
    process_inbox(tmp_path, TaskRepository(tmp_path), [], NOW)
    names = sorted(f.name for f in (inbox / "processed").iterdir())
    assert names == [f"{STAMP}-a-1.json", f"{STAMP}-a.json"]
    assert (inbox / "processed" / f"{STAMP}-a.json").read_text() == "old"


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


def test_inbox_move_failure_adds_nothing_and_retries_once(tmp_path, monkeypatch):
    import os

    inbox = tmp_path / "inbox"
    inbox.mkdir()
    (inbox / "a.json").write_text('[{"title": "a"}, {"title": "b"}]')
    repo = TaskRepository(tmp_path)

    def boom(*a, **k):
        raise PermissionError("in use")

    with monkeypatch.context() as m:
        m.setattr(os, "replace", boom)
        res = process_inbox(tmp_path, repo, [], NOW)
    assert res.imported == 0 and [p.file for p in res.problems] == ["inbox/a.json"]
    assert "could not move file" in res.problems[0].error
    assert (inbox / "a.json").exists() and repo.scan([]).tasks == []
    res = process_inbox(tmp_path, repo, [], NOW)
    assert res.imported == 2 and res.problems == []
    assert len(repo.scan([]).tasks) == 2


def test_inbox_truncated_file_left_and_reported(tmp_path):
    inbox = tmp_path / "inbox"
    inbox.mkdir()
    (inbox / "t.json").write_text('{"tasks":[{"title":"a"},{"title":"b"')
    repo = TaskRepository(tmp_path)
    res = process_inbox(tmp_path, repo, [], NOW)
    assert res.imported == 0 and [p.file for p in res.problems] == ["inbox/t.json"]
    assert res.problems[0].error.startswith("invalid JSON")
    assert (inbox / "t.json").exists() and repo.scan([]).tasks == []


def test_inbox_fenced_text_is_not_accepted(tmp_path):
    inbox = tmp_path / "inbox"
    inbox.mkdir()
    (inbox / "f.json").write_text('Here:\n```json\n[{"title": "a"}]\n```')
    res = process_inbox(tmp_path, TaskRepository(tmp_path), [], NOW)
    assert res.imported == 0 and len(res.problems) == 1 and (inbox / "f.json").exists()


import pytest


@pytest.mark.parametrize("text", ["[]", '{"tasks": []}'])
def test_inbox_empty_list_reported(tmp_path, text):
    inbox = tmp_path / "inbox"
    inbox.mkdir()
    (inbox / "e.json").write_text(text)
    res = process_inbox(tmp_path, TaskRepository(tmp_path), [], NOW)
    assert res.imported == 0 and [p.file for p in res.problems] == ["inbox/e.json"]
    assert (inbox / "e.json").exists()
