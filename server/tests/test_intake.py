from datetime import UTC, datetime

import pytest

from todoapp.intake import extract_items, import_text, preview
from todoapp.models import Project, new_id
from todoapp.normalise import IntakeError
from todoapp.store.tasks import TaskRepository

NOW = datetime(2026, 11, 13, 9, 0, tzinfo=UTC)

CHATTY = 'Sure! Here are your tasks:\n```json\n{"tasks": [{"title": "Send NDA", "project": "Line 4 Bid"}, {"title": "Book room"}]}\n```\nAnything else?'


def test_extract_from_chatty_fenced_reply():
    assert [i["title"] for i in extract_items(CHATTY)] == ["Send NDA", "Book room"]


@pytest.mark.parametrize(
    "text,n",
    [('{"title": "a"}', 1), ('[{"title": "a"}, {"title": "b"}]', 2), ('Tasks: [{"title": "a"}] thanks', 1)],
)
def test_extract_shapes(text, n):
    assert len(extract_items(text)) == n


def test_extract_nothing_raises():
    with pytest.raises(IntakeError):
        extract_items("no json here")


def test_extract_non_dict_entries_become_empty_dicts():
    assert extract_items('["oops", {"title": "a"}]') == [{}, {"title": "a"}]


def test_extract_scalar_json_raises():
    with pytest.raises(IntakeError):
        extract_items("42")


def _project():
    return Project(id=new_id(), name="Line 4 Bid", colour="peach", position=0, status="active", created_at=NOW, closed_at=None)


def test_preview_counts_unsorted_and_errors():
    p = _project()
    pv = preview('[{"title": "Send NDA", "project": "line 4 bid"}, {"title": "Book room"}, {"project": "x"}]', [p], NOW)
    assert [(i.title, i.project_id) for i in pv.items] == [("Send NDA", p.id), ("Book room", None)]
    assert pv.errors == ["Item 3: missing title"]


def test_preview_fields():
    p = _project()
    pv = preview('{"title": "a", "project": "Line 4 Bid", "task_type": "quick", "due_date": "2026-12-01"}', [p], NOW)
    i = pv.items[0]
    assert (i.project_name, i.task_type, i.due_date) == ("Line 4 Bid", "quick", "2026-12-01")
    pv = preview('{"title": "b"}', [p], NOW)
    assert (pv.items[0].project_name, pv.items[0].due_date) == (None, None)


def test_import_writes_tasks(tmp_path):
    repo = TaskRepository(tmp_path)
    created = import_text(CHATTY, repo, [], NOW)
    assert len(created) == 2 and len(repo.scan([]).tasks) == 2


def test_import_skips_invalid_items(tmp_path):
    repo = TaskRepository(tmp_path)
    created = import_text('[{"title": "a"}, {"nope": 1}]', repo, [], NOW)
    assert [t.title for t in created] == ["a"]


def test_import_nothing_extractable_raises(tmp_path):
    with pytest.raises(IntakeError):
        import_text("hello", TaskRepository(tmp_path), [], NOW)


@pytest.mark.parametrize("text", ["[]", '{"tasks": []}'])
def test_empty_list_counts_as_nothing(text, tmp_path):
    with pytest.raises(IntakeError):
        extract_items(text)
    with pytest.raises(IntakeError):
        import_text(text, TaskRepository(tmp_path), [], NOW)
