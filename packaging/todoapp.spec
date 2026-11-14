# PyInstaller spec for ToDoApp.exe: one file, windowed (no console).
# Built by scripts/build-exe.ps1, which first builds the UI and generates icon.ico.
from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules

ROOT = Path(SPECPATH).parent  # SPECPATH is this file's folder
SERVER = ROOT / "server"

a = Analysis(
    [str(SERVER / "todoapp" / "__main__.py")],
    pathex=[str(SERVER)],
    datas=[(str(SERVER / "todoapp" / "static"), "todoapp/static")],
    # pystray picks its backend at run time; uvicorn loads its protocol and loop classes by name.
    hiddenimports=["pystray._win32", *collect_submodules("uvicorn")],
    excludes=["tkinter"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="ToDoApp",
    icon=str(ROOT / "packaging" / "icon.ico"),
    console=False,
    debug=False,
    strip=False,
    upx=False,
    runtime_tmpdir=None,
)
