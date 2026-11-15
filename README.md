# ToDoApp

A local to-do board for one person. Tasks sit in a grid of projects (columns) and task types (rows: Urgent, Quick, General, Objectives, plus a Notes row per project). Every task is a plain JSON file in a folder you own, so other tools and AI assistants can add tasks by dropping a file into `inbox/` or through the Paste tasks box. The server is Python (FastAPI) on `127.0.0.1` only, the UI is Svelte/TypeScript served by that server, and the app makes no outbound network calls. It runs as a Windows exe with a tray icon, or from source. The design is in [`docs/superpowers/specs/2026-11-13-todoapp-design.md`](docs/superpowers/specs/2026-11-13-todoapp-design.md), and the AI intake format in [`docs/ai-intake/README.md`](docs/ai-intake/README.md).

## Running from source

You need Python 3.13 and Node.js. From the repository root:

```powershell
py -3.13 -m venv .venv
.venv/Scripts/python -m pip install -e "server[dev,windows]"
npm --prefix web ci
npm --prefix web run build
.venv/Scripts/python -m todoapp
```

That opens the board in your browser at `http://127.0.0.1:8765/`. To try things without touching your real tasks, point it at a scratch folder for this run only:

```powershell
.venv/Scripts/python -m todoapp --data-dir .scratch-data --config .scratch-data/settings.json --port 8790
```

Other options: `--no-browser` (don't open a browser). `TODOAPP_DATA_DIR` and `TODOAPP_PORT` also override the data folder and port for one run; neither is saved. `TODOAPP_WATCH_POLL=2` checks the data folder for outside changes (inbox drops, hand edits) every 2 seconds instead of relying on change notifications, for folders where those don't arrive, such as one mounted into a container.

## Building the Windows exe

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-exe.ps1
```

This installs the web dependencies, builds the UI, installs PyInstaller into `.venv` and writes `dist/ToDoApp.exe`. The exe opens the board in an Edge (or Chrome) app window and puts an icon in the tray; Quit from the tray stops it. Starting it again while it runs just brings the window back.

## Running the tests

```powershell
.venv/Scripts/python -m pytest server -q   # server
npm --prefix web run test                  # web unit tests (Vitest)
npm --prefix web run check                 # svelte-check and TypeScript
npm --prefix web run build                 # then the end-to-end tests need the built UI:
npm --prefix web run e2e                   # Playwright on Edge, own server on port 8799, temp data folder
```

## Where things live

- **Data folder:** `Documents\ToDoApp` by default; change it in Settings (nothing is moved, the board shows what's in the new folder). Inside it:
  - `tasks/`: one JSON file per task.
  - `projects.json`: the projects.
  - `notes/<project id>.txt`: each project's notes, plain UTF-8 text.
  - `inbox/`: drop task files here; imported files move to `inbox/processed/`.
  - `.trash/tasks/`: deleted tasks, until you empty the trash in Settings.
- **Settings:** `%LOCALAPPDATA%\ToDoApp\settings.json` (`C:\Users\<you>\AppData\Local\ToDoApp\settings.json`). It's plain JSON; a field with a bad value falls back to its default and the rest still apply.
- **Logs (the exe only):** `%LOCALAPPDATA%\ToDoApp\Logs\todoapp.log`, rotated. Run from source, the server logs to the console.

Files the app can't read are listed under "File problems" in the top bar. They're never changed or deleted.
