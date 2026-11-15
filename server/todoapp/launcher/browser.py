"""Open the UI as an Edge/Chrome app window, or bring an open one to the front."""

from __future__ import annotations

import os
import subprocess
import sys
import webbrowser
from collections.abc import Mapping
from pathlib import Path

# (environment variable, path below it), in the order they are tried: Edge first, then Chrome.
_CANDIDATES = (
    ("ProgramFiles(x86)", r"Microsoft\Edge\Application\msedge.exe"),
    ("ProgramFiles", r"Microsoft\Edge\Application\msedge.exe"),
    ("LOCALAPPDATA", r"Microsoft\Edge\Application\msedge.exe"),
    ("ProgramFiles", r"Google\Chrome\Application\chrome.exe"),
    ("ProgramFiles(x86)", r"Google\Chrome\Application\chrome.exe"),
    ("LOCALAPPDATA", r"Google\Chrome\Application\chrome.exe"),
)

# Edge and Chrome top-level windows both use this class. Matching it stops a File Explorer
# window on a folder called "ToDoApp" from being mistaken for the app.
_CHROMIUM_WINDOW_CLASS = "Chrome_WidgetWin_1"


def find_app_browser(env: Mapping[str, str]) -> Path | None:
    for var, rel in _CANDIDATES:
        base = env.get(var, "").strip()
        if not base:
            continue
        exe = Path(base) / rel
        if exe.is_file():
            return exe
    return None


def open_app_window(url: str, env: Mapping[str, str] = os.environ) -> None:
    """Open `url` in an app window (no address bar or tabs), or a normal tab as a fallback."""
    exe = find_app_browser(env)
    if exe is not None:
        try:
            subprocess.Popen([str(exe), f"--app={url}"], close_fds=True)
            return
        except OSError:
            pass
    webbrowser.open(url)


def _app_windows(title: str) -> list[int]:
    """Handles of visible Edge/Chrome top-level windows titled exactly `title`. Windows only."""
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.WinDLL("user32", use_last_error=True)
    enum_proc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    user32.EnumWindows.argtypes = [enum_proc, wintypes.LPARAM]
    user32.IsWindowVisible.argtypes = [wintypes.HWND]
    user32.GetWindowTextLengthW.argtypes = [wintypes.HWND]
    user32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    user32.GetClassNameW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]

    found: list[int] = []

    def visit(hwnd, _lparam):
        if not user32.IsWindowVisible(hwnd):
            return True
        length = user32.GetWindowTextLengthW(hwnd)
        if length != len(title):
            return True
        text = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, text, length + 1)
        cls = ctypes.create_unicode_buffer(256)
        user32.GetClassNameW(hwnd, cls, 256)
        if text.value == title and cls.value == _CHROMIUM_WINDOW_CLASS:
            found.append(hwnd)
        return True

    user32.EnumWindows(enum_proc(visit), 0)
    return found


def focus_existing_window(title: str = "ToDoApp") -> bool:
    """Restore and bring forward a visible browser window titled exactly `title`. Windows only."""
    if sys.platform != "win32":
        return False
    import ctypes
    from ctypes import wintypes

    found = _app_windows(title)
    if not found:
        return False
    user32 = ctypes.WinDLL("user32", use_last_error=True)
    user32.IsIconic.argtypes = [wintypes.HWND]
    user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
    user32.SetForegroundWindow.argtypes = [wintypes.HWND]
    hwnd = found[0]
    SW_RESTORE = 9
    if user32.IsIconic(hwnd):  # only un-minimise; SW_RESTORE would un-maximise a maximised window
        user32.ShowWindow(hwnd, SW_RESTORE)
    user32.SetForegroundWindow(hwnd)
    return True


def close_app_windows(title: str = "ToDoApp") -> int:
    """Ask every visible browser window titled exactly `title` to close (WM_CLOSE, like its ✕).

    Used by tray Quit, so a dead app window isn't left behind. A normal browser tab's window is
    titled "ToDoApp - Microsoft Edge" or similar, so only app-mode windows match. Windows only;
    returns how many windows were asked to close.
    """
    if sys.platform != "win32":
        return 0
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.WinDLL("user32", use_last_error=True)
    user32.PostMessageW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
    WM_CLOSE = 0x0010
    found = _app_windows(title)
    for hwnd in found:
        user32.PostMessageW(hwnd, WM_CLOSE, 0, 0)
    return len(found)
