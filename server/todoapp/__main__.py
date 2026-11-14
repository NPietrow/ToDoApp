"""`python -m todoapp`, and the script PyInstaller freezes into ToDoApp.exe."""

from todoapp.launcher.main import main

if __name__ == "__main__":
    raise SystemExit(main())
