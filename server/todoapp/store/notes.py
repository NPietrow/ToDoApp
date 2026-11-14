"""Per-project notes, stored as plain text in <data>/notes/<project id>.txt."""

from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path

from ..fsutil import atomic_write_text
from ..models import is_uuid
from .tasks import FileProblem


class NotesRepository:
    def __init__(self, data_dir: Path):
        self._dir = Path(data_dir) / "notes"

    def _path(self, project_id: str) -> Path:
        if not is_uuid(project_id):
            raise ValueError(f"invalid project id: {project_id!r}")
        return self._dir / f"{project_id}.txt"

    @staticmethod
    def _rel(project_id: str) -> str:
        return f"notes/{project_id}.txt"

    def get(self, project_id: str) -> str:
        path = self._path(project_id)
        try:
            return path.read_bytes().decode("utf-8-sig").replace("\r\n", "\n")
        except FileNotFoundError:
            return ""

    def read(self, project_id: str) -> tuple[str, FileProblem | None]:
        """The notes, or ("", problem) if the file can't be read (not UTF-8, locked, ...)."""
        try:
            return self.get(project_id), None
        except UnicodeDecodeError:
            return "", FileProblem(self._rel(project_id), "not UTF-8 text; save it as UTF-8")
        except OSError as e:
            return "", FileProblem(self._rel(project_id), f"unreadable: {e}")

    def put(self, project_id: str, text: str) -> None:
        path = self._path(project_id)
        _, problem = self.read(project_id)
        if problem is not None:  # an unreadable file is reported, never overwritten
            raise ValueError(f"{problem.file} can't be read, so it wasn't changed. Fix it or move it aside.")
        atomic_write_text(path, text.replace("\r\n", "\n"))

    def all(self, ids: Iterable[str]) -> tuple[dict[str, str], list[FileProblem]]:
        texts: dict[str, str] = {}
        problems: list[FileProblem] = []
        for i in ids:
            texts[i], problem = self.read(i)
            if problem is not None:
                problems.append(problem)
        return texts, problems
