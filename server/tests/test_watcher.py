import json
import time
from pathlib import Path

from todoapp.watcher import DataWatcher


def wait_for(predicate, timeout=5.0):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if predicate():
            return True
        time.sleep(0.05)
    return predicate()


def test_watcher_debounces_and_ignores_temp(tmp_path):
    calls = []
    w = DataWatcher(tmp_path, lambda: calls.append(1), debounce_s=0.2)
    w.start()
    try:
        (tmp_path / "tasks").mkdir()
        for i in range(5):
            (tmp_path / "tasks" / f"{i}.json").write_text("{}")
        (tmp_path / "tasks" / ".x.json.ab12.tmp").write_text("{}")
        time.sleep(1.0)
        assert len(calls) == 1
    finally:
        w.stop()


def test_temp_files_alone_do_not_fire(tmp_path):
    (tmp_path / "tasks").mkdir()
    calls = []
    w = DataWatcher(tmp_path, lambda: calls.append(1), debounce_s=0.1)
    w.start()
    try:
        (tmp_path / "tasks" / ".x.json.ab12.tmp").write_text("{}")
        (tmp_path / "tasks" / "~$lock.json").write_text("{}")
        time.sleep(0.6)
        assert calls == []
    finally:
        w.stop()


def test_processed_and_trash_are_ignored(tmp_path):
    (tmp_path / "inbox" / "processed").mkdir(parents=True)
    (tmp_path / ".trash").mkdir()
    calls = []
    w = DataWatcher(tmp_path, lambda: calls.append(1), debounce_s=0.1)
    w.start()
    try:
        (tmp_path / "inbox" / "processed" / "a.json").write_text("{}")
        (tmp_path / ".trash" / "b.json").write_text("{}")
        time.sleep(0.6)
        assert calls == []
        (tmp_path / "inbox" / "c.json").write_text("{}")
        assert wait_for(lambda: len(calls) == 1)
    finally:
        w.stop()


def test_removing_a_processed_file_refreshes(tmp_path):
    # Its skipped-item problems are cleared by the refresh this triggers.
    (tmp_path / "inbox" / "processed").mkdir(parents=True)
    f = tmp_path / "inbox" / "processed" / "a.json"
    f.write_text("{}")
    calls = []
    w = DataWatcher(tmp_path, lambda: calls.append(1), debounce_s=0.1)
    w.start()
    try:
        f.unlink()
        assert wait_for(lambda: len(calls) == 1)
    finally:
        w.stop()


def test_stop_is_idempotent(tmp_path):
    w = DataWatcher(tmp_path, lambda: None, debounce_s=0.1)
    w.stop()  # before start
    w.start()
    w.stop()
    w.stop()


def test_raising_on_change_does_not_stop_the_watcher(tmp_path):
    calls = []

    def boom():
        calls.append(1)
        raise RuntimeError("boom")

    w = DataWatcher(tmp_path, boom, debounce_s=0.1)
    w.start()
    try:
        (tmp_path / "a.json").write_text("{}")
        assert wait_for(lambda: len(calls) == 1)
        (tmp_path / "b.json").write_text("{}")
        assert wait_for(lambda: len(calls) == 2)
    finally:
        w.stop()


def test_dropping_a_file_in_inbox_becomes_a_task(client):
    ctx = client.app.state.ctx
    inbox = Path(ctx.settings.data_dir) / "inbox"
    inbox.mkdir(parents=True, exist_ok=True)
    tmp = inbox / "drop.json.part"
    tmp.write_text(json.dumps({"title": "From the watcher"}), encoding="utf-8")
    tmp.replace(inbox / "drop.json")

    def has_task():
        return any(t["title"] == "From the watcher" for t in client.get("/api/state").json()["tasks"])

    assert wait_for(has_task, timeout=8.0)


# --- Docker: the watcher must never stop the app starting; polling as an opt-in ---


def test_a_watcher_that_cannot_start_is_logged_not_raised(tmp_path, monkeypatch, caplog):
    import todoapp.watcher as watcher_mod

    class NoInotify(watcher_mod.Observer):
        def start(self):
            raise OSError(28, "inotify watch limit reached")

    monkeypatch.setattr(watcher_mod, "Observer", NoInotify)
    w = DataWatcher(tmp_path, lambda: None, debounce_s=0.1)
    with caplog.at_level("WARNING", logger="todoapp.watcher"):
        w.start()  # must not raise
    assert "TODOAPP_WATCH_POLL" in caplog.text  # tells the reader what to do about it
    assert not w.running
    w.stop()  # still safe


def test_polling_mode_sees_new_files(tmp_path):
    from watchdog.observers.polling import PollingObserver

    calls = []
    w = DataWatcher(tmp_path, lambda: calls.append(1), debounce_s=0.1, poll_s=0.2)
    w.start()
    try:
        assert isinstance(w._observer, PollingObserver)
        assert w.running
        (tmp_path / "inbox").mkdir()
        (tmp_path / "inbox" / "drop.json").write_text("{}")
        assert wait_for(lambda: len(calls) >= 1)
    finally:
        w.stop()


def test_context_uses_the_poll_setting(tmp_path):
    from todoapp.config import AppSettings, RuntimeOptions
    from todoapp.context import AppContext

    ctx = AppContext(AppSettings(data_dir=tmp_path), RuntimeOptions(watch_poll_s=1.0), tmp_path / "s.json")
    ctx.start_watcher()
    try:
        assert ctx._watcher is not None and ctx._watcher.poll_s == 1.0
    finally:
        ctx.stop_watcher()
