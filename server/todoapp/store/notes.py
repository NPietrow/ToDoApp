"""Per-project notes, stored as plain text in <data>/notes/<project id>.txt."""

from __future__ import annotations

from collections.abc import Iterable
from pathlib import Path

from ..fsutil import atomic_write_text
from ..models import is_uuid


class NotesRepository:
    def __init__(self, data_dir: Path):
        self._dir = Path(data_dir) / "notes"

    def _path(self, project_id: str) -> Path:
        if not is_uuid(project_id):
            raise ValueError(f"invalid project id: {project_id!r}")
        return self._dir / f"{project_id}.txt"

    def get(self, project_id: str) -> str:
        path = self._path(project_id)
        try:
            return path.read_bytes().decode("utf-8-sig").replace("\r\n", "\n")
        except FileNotFoundError:
            return ""

    def put(self, project_id: str, text: str) -> None:
        atomic_write_text(self._path(project_id), text.replace("\r\n", "\n"))

    def all(self, ids: Iterable[str]) -> dict[str, str]:
        return {i: self.get(i) for i in ids}
