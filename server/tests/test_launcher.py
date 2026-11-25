"""Windows launcher: browser discovery, single-instance probe, Startup shortcut, settings wiring.

Nothing here opens a window, focuses one or shows a message box: those parts are mocked.
"""

import http.server
import json
import socket
import sys
import threading
import time
from pathlib import Path
from types import SimpleNamespace

import pytest

from todoapp.app import create_app
from todoapp.config import AppSettings, RuntimeOptions
from todoapp.launcher import browser, single_instance, startup
from todoapp.launcher import main as launcher_main
from todoapp.launcher.browser import find_app_browser
from todoapp.launcher.single_instance import probe
from todoapp.launcher.startup import is_start_at_login, set_start_at_login


def _free_port() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


@pytest.fixture
def running_server(tmp_path):
    """The real app under uvicorn on a free port, in a background thread."""
    port = _free_port()
    app = create_app(
        AppSettings(data_dir=tmp_path / "data", port=port),
        RuntimeOptions(),
        config_path=tmp_path / "config" / "settings.json",
        watch=False,
    )
    server = launcher_main.make_server(app, "127.0.0.1", port, log_config=None, log_level="warning")
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.monotonic() + 10
    while not server.started and time.monotonic() < deadline:
        time.sleep(0.05)
    assert server.started
    yield SimpleNamespace(port=port, server=server, thread=thread)
    server.should_exit = True
    thread.join(timeout=10)


@pytest.fixture
def other_server():
    """An HTTP server on a free port that is not ToDoApp."""

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            body = json.dumps({"app": "something-else"}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    httpd = http.server.HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    yield httpd.server_address[1]
    httpd.shutdown()
    httpd.server_close()
    thread.join(timeout=5)


def test_quit_is_fast_with_open_event_stream(running_server):
    import httpx

    opened = threading.Event()

    def hold_stream():
        try:
            with httpx.stream("GET", f"http://127.0.0.1:{running_server.port}/api/events", timeout=10) as r:
                opened.set()
                for _ in r.iter_raw():
                    pass
        except httpx.HTTPError:
            opened.set()

    client = threading.Thread(target=hold_stream, daemon=True)
    client.start()
    assert opened.wait(5)
    time.sleep(0.2)  # let the server register the stream

    started = time.monotonic()
    running_server.server.should_exit = True
    running_server.thread.join(timeout=5)
    assert not running_server.thread.is_alive()
    assert time.monotonic() - started < 1.0
    client.join(timeout=5)


# --- browser ------------------------------------------------------------------


def test_find_app_browser_prefers_edge_then_chrome(tmp_path):
    env = {"ProgramFiles(x86)": str(tmp_path/"x86"), "ProgramFiles": str(tmp_path/"pf"), "LOCALAPPDATA": str(tmp_path/"la")}
    chrome = tmp_path/"pf/Google/Chrome/Application/chrome.exe"; chrome.parent.mkdir(parents=True); chrome.touch()
    assert find_app_browser(env) == chrome
    edge = tmp_path/"la/Microsoft/Edge/Application/msedge.exe"; edge.parent.mkdir(parents=True); edge.touch()
    assert find_app_browser(env) == edge


def test_find_app_browser_none(tmp_path):
    assert find_app_browser({"ProgramFiles": str(tmp_path)}) is None


def test_find_app_browser_order_is_exact(tmp_path):
    env = {"ProgramFiles(x86)": str(tmp_path/"x86"), "ProgramFiles": str(tmp_path/"pf"), "LOCALAPPDATA": str(tmp_path/"la")}
    order = [
        tmp_path/"x86/Microsoft/Edge/Application/msedge.exe",
        tmp_path/"pf/Microsoft/Edge/Application/msedge.exe",
        tmp_path/"la/Microsoft/Edge/Application/msedge.exe",
        tmp_path/"pf/Google/Chrome/Application/chrome.exe",
        tmp_path/"x86/Google/Chrome/Application/chrome.exe",
        tmp_path/"la/Google/Chrome/Application/chrome.exe",
    ]
    for p in order:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.touch()
    for p in order:
        assert find_app_browser(env) == p
        p.unlink()
    assert find_app_browser(env) is None


# --- single instance ----------------------------------------------------------


def test_probe_free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    assert probe(port) == "free"


def test_probe_ours(running_server):          # fixture: uvicorn on a free port in a thread
    assert probe(running_server.port) == "ours"


def test_probe_other(other_server):
    assert probe(other_server) == "other"


# --- Startup shortcut ---------------------------------------------------------


def test_shortcut_path(tmp_path):
    assert startup.shortcut_path({"APPDATA": str(tmp_path)}) == (
        tmp_path / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup" / "ToDoApp.lnk"
    )


@pytest.mark.skipif(sys.platform != "win32", reason="Windows only")
def test_start_at_login_round_trip(tmp_path):
    env = {"APPDATA": str(tmp_path)}; exe = tmp_path/"ToDoApp.exe"; exe.touch()
    set_start_at_login(True, exe, env); assert is_start_at_login(env)
    set_start_at_login(False, exe, env); assert not is_start_at_login(env)


# --- main: what a frozen launch does when the port is taken -------------------


@pytest.fixture
def frozen(monkeypatch, tmp_path):
    """Pretend to be the Windows exe, with every window/message-box call recorded."""
    calls: list[tuple] = []
    monkeypatch.setattr(launcher_main, "is_windows_app", lambda: True)
    monkeypatch.setattr(browser, "focus_existing_window", lambda title="ToDoApp": calls.append(("focus",)) or True)
    monkeypatch.setattr(browser, "open_app_window", lambda url, env=None: calls.append(("open", url)))
    monkeypatch.setattr(launcher_main, "message_box", lambda text: calls.append(("box", text)))
    argv = ["--config", str(tmp_path / "config" / "settings.json"), "--data-dir", str(tmp_path / "data"), "--port", "8797"]
    return SimpleNamespace(calls=calls, argv=argv)


def test_frozen_second_launch_focuses_existing_window(frozen, monkeypatch):
    monkeypatch.setattr(single_instance, "probe", lambda port, timeout=1.0: "ours")
    assert launcher_main.main(frozen.argv) == 0
    assert frozen.calls == [("focus",)]


def test_frozen_second_launch_opens_window_when_none_to_focus(frozen, monkeypatch):
    monkeypatch.setattr(single_instance, "probe", lambda port, timeout=1.0: "ours")
    monkeypatch.setattr(browser, "focus_existing_window", lambda title="ToDoApp": False)
    assert launcher_main.main(frozen.argv) == 0
    assert frozen.calls == [("open", "http://127.0.0.1:8797/")]


def test_frozen_port_used_by_another_program(frozen, monkeypatch):
    monkeypatch.setattr(single_instance, "probe", lambda port, timeout=1.0: "other")
    assert launcher_main.main(frozen.argv) == 1
    assert frozen.calls == [("box", "Port 8797 is in use by another program. Change the port in settings.json.")]


# --- PATCH /api/settings wires start_at_login (Windows app only) ---------------


@pytest.fixture
def shortcut_calls(monkeypatch):
    calls: list[tuple[bool, Path]] = []
    monkeypatch.setattr(startup, "set_start_at_login", lambda enabled, exe, env=None: calls.append((enabled, exe)))
    return calls


def test_start_at_login_patch_updates_shortcut_then_saves(make_client, tmp_path, shortcut_calls):
    c = make_client(RuntimeOptions(windows_app=True))
    r = c.patch("/api/settings", json={"start_at_login": True})
    assert r.status_code == 200 and r.json()["start_at_login"] is True
    assert shortcut_calls == [(True, Path(sys.executable))]
    assert json.loads((tmp_path / "config" / "settings.json").read_text())["start_at_login"] is True
    # an unchanged value doesn't touch the shortcut again
    c.patch("/api/settings", json={"start_at_login": True, "text_size": "large"})
    assert shortcut_calls == [(True, Path(sys.executable))]
    c.patch("/api/settings", json={"start_at_login": False})
    assert shortcut_calls == [(True, Path(sys.executable)), (False, Path(sys.executable))]


def _com_error():
    pywintypes = pytest.importorskip("pywintypes")
    return pywintypes.com_error(-2147024891, "Access is denied.", None, None)


@pytest.mark.parametrize(
    "make_error, detail",
    [
        (lambda: PermissionError(13, "Access is denied"), "Access is denied"),
        (_com_error, "Access is denied."),
    ],
    ids=["oserror", "com_error"],
)
def test_start_at_login_patch_failure_is_422_and_not_saved(make_client, tmp_path, monkeypatch, make_error, detail):
    error = make_error()

    def fail(enabled, exe, env=None):
        raise error

    monkeypatch.setattr(startup, "set_start_at_login", fail)
    c = make_client(RuntimeOptions(windows_app=True))
    r = c.patch("/api/settings", json={"start_at_login": True})
    assert r.status_code == 422
    assert r.json()["detail"] == f"Couldn't update the Startup shortcut: {detail}"
    assert not (tmp_path / "config" / "settings.json").exists()
    assert c.get("/api/state").json()["settings"]["start_at_login"] is False


def test_start_at_login_patch_outside_windows_app_leaves_shortcut_alone(make_client, shortcut_calls):
    c = make_client()
    r = c.patch("/api/settings", json={"start_at_login": True})
    assert r.status_code == 200 and r.json()["start_at_login"] is True
    assert shortcut_calls == []


# --- Quit closes the app window (tray Quit used to leave a dead Edge window behind) ---


class _FakeClock:
    def __init__(self):
        self.t = 0.0
        self.sleeps: list[float] = []

    def now(self) -> float:
        return self.t

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.t += seconds


def test_quit_app_waits_for_the_window_to_close_then_a_grace_before_stopping(monkeypatch):
    # The closing page sends its last notes/task save (keepalive) on pagehide: the server must
    # still be up for that, so Quit waits for the window to go, plus a grace, before stopping.
    server = SimpleNamespace(should_exit=False)
    clock = _FakeClock()
    still_open = iter([True, True, False])
    monkeypatch.setattr(browser, "close_app_windows", lambda title="ToDoApp": 1)
    monkeypatch.setattr(browser, "app_windows_open", lambda title="ToDoApp": next(still_open))
    real_sleep = clock.sleep

    def sleep(seconds):
        assert server.should_exit is False  # nothing stopped while we wait
        real_sleep(seconds)

    launcher_main._quit_app(server, sleep=sleep, now=clock.now)
    assert clock.sleeps == [launcher_main.QUIT_POLL_S, launcher_main.QUIT_POLL_S, launcher_main.QUIT_GRACE_S]
    assert server.should_exit is True


def test_quit_app_gives_up_waiting_after_the_timeout(monkeypatch):
    server = SimpleNamespace(should_exit=False)
    clock = _FakeClock()
    monkeypatch.setattr(browser, "close_app_windows", lambda title="ToDoApp": 1)
    monkeypatch.setattr(browser, "app_windows_open", lambda title="ToDoApp": True)  # never closes
    launcher_main._quit_app(server, sleep=clock.sleep, now=clock.now)
    assert clock.t <= launcher_main.QUIT_WAIT_S + launcher_main.QUIT_POLL_S + launcher_main.QUIT_GRACE_S + 1e-9
    assert server.should_exit is True


def test_quit_app_with_no_window_stops_at_once(monkeypatch):
    server = SimpleNamespace(should_exit=False)
    clock = _FakeClock()
    monkeypatch.setattr(browser, "close_app_windows", lambda title="ToDoApp": 0)
    launcher_main._quit_app(server, sleep=clock.sleep, now=clock.now)
    assert clock.sleeps == []
    assert server.should_exit is True


def test_quit_app_stops_server_even_if_closing_window_fails(monkeypatch):
    server = SimpleNamespace(should_exit=False)

    def boom(title="ToDoApp"):
        raise OSError("no window station")

    monkeypatch.setattr(browser, "close_app_windows", boom)
    launcher_main._quit_app(server)
    assert server.should_exit is True


def test_close_app_windows_is_a_no_op_off_windows(monkeypatch):
    monkeypatch.setattr(browser.sys, "platform", "linux")
    assert browser.close_app_windows() == 0
    assert browser.app_windows_open() is False


@pytest.mark.skipif(sys.platform != "win32", reason="Windows window enumeration")
def test_close_app_windows_ignores_other_titles():
    assert browser.close_app_windows("ToDoApp test window that does not exist 7f3a") == 0
