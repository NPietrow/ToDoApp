"""The "Start when I log in" shortcut in the user's own Startup folder (no admin rights)."""

from __future__ import annotations

import os
from collections.abc import Mapping
from pathlib import Path

try:  # pywin32 is Windows-only
    from pywintypes import com_error
except ImportError:  # pragma: no cover - non-Windows

    class com_error(Exception):  # type: ignore[no-redef]
        """Stand-in so `except com_error` works where pywin32 isn't installed."""


def shortcut_path(env: Mapping[str, str] = os.environ) -> Path:
    return (
        Path(env["APPDATA"]) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup" / "ToDoApp.lnk"
    )


def set_start_at_login(enabled: bool, exe: Path, env: Mapping[str, str] = os.environ) -> None:
    """Create or remove the Startup shortcut. Raises OSError or com_error on failure."""
    path = shortcut_path(env)
    if not enabled:
        path.unlink(missing_ok=True)
        return
    import pythoncom
    import win32com.client

    path.parent.mkdir(parents=True, exist_ok=True)
    exe = Path(exe)
    # FastAPI runs sync endpoints in worker threads, which need COM initialised.
    pythoncom.CoInitialize()
    try:
        shell = win32com.client.Dispatch("WScript.Shell")
        shortcut = shell.CreateShortcut(str(path))
        shortcut.TargetPath = str(exe)
        shortcut.WorkingDirectory = str(exe.parent)
        shortcut.IconLocation = f"{exe},0"
        shortcut.Description = "ToDoApp"
        shortcut.Save()
        del shortcut, shell  # release the COM objects before uninitialising
    finally:
        pythoncom.CoUninitialize()


def is_start_at_login(env: Mapping[str, str] = os.environ) -> bool:
    return shortcut_path(env).is_file()
