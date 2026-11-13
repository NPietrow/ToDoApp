"""Project repository: <data>/projects.json."""

from __future__ import annotations

from pathlib import Path

from ..fsutil import atomic_write_json, read_json
from ..models import SCHEMA_VERSION, Project, is_uuid, new_id, utcnow
from ..palette import PALETTE_KEYS, next_colour


class DuplicateName(Exception):
    pass


class ProjectNotFound(KeyError):
    pass


def _key(name: str) -> str:
    return name.strip().casefold()


class ProjectRepository:
    def __init__(self, data_dir: Path):
        self._path = Path(data_dir) / "projects.json"

    # -- persistence ------------------------------------------------------
    def _load(self) -> list[Project]:
        if not self._path.exists():
            return []
        raw = read_json(self._path)  # a corrupt file raises; it is never deleted
        projects = [Project.model_validate(p) for p in raw["projects"]]
        return sorted(projects, key=lambda p: p.position)

    def _save(self, projects: list[Project]) -> None:
        atomic_write_json(
            self._path,
            {
                "schema_version": SCHEMA_VERSION,
                "projects": [p.model_dump(mode="json") for p in projects],
            },
        )

    @staticmethod
    def _renumber(projects: list[Project]) -> None:
        """Renumber active projects 0..n-1; closed ones keep their position."""
        for i, p in enumerate(p for p in projects if p.status == "active"):
            p.position = i

    @staticmethod
    def _check_id(id: str) -> None:
        if not is_uuid(id):
            raise ValueError(f"invalid project id: {id!r}")

    @staticmethod
    def _find(projects: list[Project], id: str) -> Project:
        for p in projects:
            if p.id == id:
                return p
        raise ProjectNotFound(id)

    @staticmethod
    def _check_name(projects: list[Project], name: str, exclude_id: str | None = None) -> str:
        cleaned = name.strip()
        if not cleaned:
            raise ValueError("name must not be empty")
        for p in projects:
            if p.status == "active" and p.id != exclude_id and _key(p.name) == _key(cleaned):
                raise DuplicateName(cleaned)
        return cleaned

    # -- queries ----------------------------------------------------------
    def list(self) -> list[Project]:
        return self._load()

    def active(self) -> list[Project]:
        return [p for p in self._load() if p.status == "active"]

    def get(self, id: str) -> Project:
        self._check_id(id)
        return self._find(self._load(), id)

    # -- commands ---------------------------------------------------------
    def create(self, name: str, position: int | None = None) -> Project:
        projects = self._load()
        cleaned = self._check_name(projects, name)
        active = [p for p in projects if p.status == "active"]
        project = Project(
            id=new_id(),
            name=cleaned,
            colour=next_colour(p.colour for p in active),
            position=len(active),
            created_at=utcnow(),
        )
        if position is None:
            active.append(project)
        else:
            active.insert(max(0, min(position, len(active))), project)
        closed = [p for p in projects if p.status == "closed"]
        for i, p in enumerate(active):
            p.position = i
        self._save(active + closed)
        return project

    def rename(self, id: str, name: str) -> Project:
        self._check_id(id)
        projects = self._load()
        project = self._find(projects, id)
        if project.status == "active":
            project.name = self._check_name(projects, name, exclude_id=id)
        else:
            project.name = self._check_name([], name)
        self._save(projects)
        return project

    def set_colour(self, id: str, colour: str) -> Project:
        self._check_id(id)
        if colour not in PALETTE_KEYS:
            raise ValueError(f"unknown colour: {colour!r}")
        projects = self._load()
        project = self._find(projects, id)
        project.colour = colour
        self._save(projects)
        return project

    def move(self, id: str, position: int) -> list[Project]:
        self._check_id(id)
        projects = self._load()
        project = self._find(projects, id)
        if project.status != "active":
            raise ValueError("only active projects can be moved")
        active = [p for p in projects if p.status == "active" and p.id != id]
        active.insert(max(0, min(position, len(active))), project)
        for i, p in enumerate(active):
            p.position = i
        self._save(active + [p for p in projects if p.status == "closed"])
        return active

    def close(self, id: str) -> Project:
        self._check_id(id)
        projects = self._load()
        project = self._find(projects, id)
        if project.status == "active":
            project.status = "closed"
            project.closed_at = utcnow()
            self._renumber(projects)  # closed project keeps its last position
            self._save(projects)
        return project

    def reopen(self, id: str) -> Project:
        self._check_id(id)
        projects = self._load()
        project = self._find(projects, id)
        if project.status == "closed":
            self._check_name(projects, project.name)
            active_count = sum(1 for p in projects if p.status == "active")
            project.status = "active"
            project.closed_at = None
            project.position = active_count
            self._save(projects)
        return project
