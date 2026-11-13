"""Task repository: one JSON file per task in <data>/tasks/, soft-delete in <data>/.trash/tasks/."""

from __future__ import annotations

import os
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from pydantic import ValidationError

from ..fsutil import atomic_write_json, is_temp_file, read_json
from ..models import (
    SCHEMA_VERSION,
    Project,
    Status,
    Task,
    TaskChanges,
    TaskType,
    is_uuid,
    new_id,
    utcnow,
)
from ..normalise import IntakeError, normalise_task


class TaskNotFound(KeyError):
    pass


@dataclass
class FileProblem:
    file: str  # relative to the data folder, forward slashes
    error: str


@dataclass
class ScanResult:
    tasks: list[Task] = field(default_factory=list)
    problems: list[FileProblem] = field(default_factory=list)


_Sig = tuple[int, int]  # (st_mtime_ns, st_size)


class TaskRepository:
    def __init__(self, data_dir: Path):
        self._dir = Path(data_dir)
        self._tasks_dir = self._dir / "tasks"
        self._trash_dir = self._dir / ".trash" / "tasks"
        self._tasks: dict[str, Task] = {}
        self._problems: list[FileProblem] = []
        self._loaded = False
        # path -> (signature, parsed result), so unchanged files are not re-parsed
        self._cache: dict[str, tuple[_Sig, Task | FileProblem]] = {}

    # -- helpers ----------------------------------------------------------
    def _path(self, id: str) -> Path:
        return self._tasks_dir / f"{id}.json"

    def _rel(self, path: Path) -> str:
        return path.relative_to(self._dir).as_posix()

    def _write(self, task: Task) -> None:
        atomic_write_json(self._path(task.id), task.model_dump(mode="json"))
        self._tasks[task.id] = task

    def _task_files(self) -> list[Path]:
        if not self._tasks_dir.is_dir():
            return []
        return sorted(
            p for p in self._tasks_dir.glob("*.json") if p.is_file() and not is_temp_file(p.name)
        )

    @staticmethod
    def _complete(raw: object) -> Task | None:
        """The task, if `raw` is a full schema-v1 record; otherwise None."""
        if not isinstance(raw, dict) or raw.get("schema_version") != SCHEMA_VERSION:
            return None
        if not set(Task.model_fields) <= raw.keys():
            return None
        try:
            return Task.model_validate(raw)
        except ValidationError:
            return None

    def _ensure_loaded(self) -> None:
        """Before the first scan, load valid files without normalising or writing anything."""
        if self._loaded:
            return
        for path in self._task_files():
            try:
                task = self._complete(read_json(path))
            except (ValueError, OSError):
                continue
            if task is not None:
                self._tasks[task.id] = task
        self._loaded = True

    def _cell(self, project_id: str | None, task_type: TaskType, exclude: str | None = None) -> list[Task]:
        cell = [
            t
            for t in self._tasks.values()
            if t.project_id == project_id and t.task_type == task_type and t.id != exclude
        ]
        return sorted(cell, key=lambda t: t.order)

    def _next_order(self, project_id: str | None, task_type: TaskType, exclude: str | None = None) -> int:
        cell = self._cell(project_id, task_type, exclude)
        return cell[-1].order + 1 if cell else 0

    @staticmethod
    def _check_project_id(project_id: str | None) -> None:
        if project_id is not None and not is_uuid(project_id):
            raise ValueError(f"invalid project id: {project_id!r}")

    # -- scan -------------------------------------------------------------
    def scan(self, active: Sequence[Project]) -> ScanResult:
        now = utcnow()
        tasks: dict[str, Task] = {}
        problems: list[FileProblem] = []
        cache: dict[str, tuple[_Sig, Task | FileProblem]] = {}

        for path in self._task_files():
            try:
                st = path.stat()
            except OSError as e:
                problems.append(FileProblem(self._rel(path), str(e)))
                continue
            sig = (st.st_mtime_ns, st.st_size)
            hit = self._cache.get(str(path))
            if hit and hit[0] == sig and not (isinstance(hit[1], Task) and hit[1].id in tasks):
                result = hit[1]
            else:
                result = self._read_one(path, active, now, tasks)
                if isinstance(result, Task):
                    # the file may have been rewritten or renamed; re-stat its final home
                    final = self._path(result.id)
                    try:
                        fst = final.stat()
                        path, sig = final, (fst.st_mtime_ns, fst.st_size)
                    except OSError:
                        pass
            cache[str(path)] = (sig, result)
            if isinstance(result, Task):
                tasks[result.id] = result
            else:
                problems.append(result)

        self._cache = cache
        self._tasks = tasks
        self._problems = problems
        self._loaded = True
        return ScanResult(list(tasks.values()), list(problems))

    def _read_one(
        self, path: Path, active: Sequence[Project], now: datetime, seen: dict[str, Task]
    ) -> Task | FileProblem:
        rel = self._rel(path)
        try:
            raw = read_json(path)
        except (ValueError, OSError) as e:
            return FileProblem(rel, f"unreadable: {e}")
        if not isinstance(raw, dict):
            return FileProblem(rel, "not a JSON object")
        task = self._complete(raw)
        complete = task is not None
        if task is None:
            try:
                task = normalise_task(raw, active, now)
            except IntakeError as e:
                return FileProblem(rel, str(e))
        target = self._path(task.id)
        if complete and target == path and task.id not in seen:
            return task  # already in canonical form; nothing to write
        if task.id in seen or (target.exists() and target != path):
            task = task.model_copy(update={"id": new_id()})  # id clash: never overwrite another file
            target = self._path(task.id)
        try:
            atomic_write_json(target, task.model_dump(mode="json"))
        except OSError as e:
            return FileProblem(rel, f"could not write normalised file: {e}")
        if target != path:
            try:
                path.unlink()  # only after the replacement is safely on disk
            except OSError:
                pass
        return task

    # -- queries ----------------------------------------------------------
    def all(self) -> list[Task]:
        return list(self._tasks.values())

    def problems(self) -> list[FileProblem]:
        return list(self._problems)

    def get(self, id: str) -> Task:
        if not is_uuid(id):
            raise TaskNotFound(id)
        if id in self._tasks:
            return self._tasks[id]
        path = self._path(id)
        if path.is_file():
            try:
                task = self._complete(read_json(path))
            except (ValueError, OSError):
                task = None
            if task is not None and task.id == id:
                self._tasks[id] = task
                return task
        raise TaskNotFound(id)

    # -- commands ---------------------------------------------------------
    def create(self, title: str, project_id: str | None, task_type: TaskType = TaskType.GENERAL) -> Task:
        self._check_project_id(project_id)
        now = utcnow()
        task = Task(
            id=new_id(),
            title=title,
            project_id=project_id,
            task_type=task_type,
            created_at=now,
            updated_at=now,
        )
        return self.add(task)

    def add(self, task: Task) -> Task:
        self._ensure_loaded()
        self._check_project_id(task.project_id)
        updates: dict = {"order": self._next_order(task.project_id, task.task_type)}
        if task.id in self._tasks or self._path(task.id).exists():
            updates["id"] = new_id()
        task = task.model_copy(update=updates)
        self._write(task)
        return task

    def update(self, id: str, changes: TaskChanges) -> Task:
        self._ensure_loaded()
        old = self.get(id)
        data = old.model_dump()
        for name in changes.model_fields_set:
            data[name] = getattr(changes, name)
        now = utcnow()
        data["updated_at"] = now

        if "status" in changes.model_fields_set and changes.status is not None:
            if changes.status == Status.DONE and old.status != Status.DONE:
                data["status_before_done"] = old.status
                data["completed_at"] = now
            elif changes.status != Status.DONE and old.status == Status.DONE:
                data["status_before_done"] = None
                data["completed_at"] = None

        task = Task.model_validate(data)  # applies the title rules; raises ValueError
        if (task.project_id, task.task_type) != (old.project_id, old.task_type):
            self._check_project_id(task.project_id)
            task = task.model_copy(update={"order": self._next_order(task.project_id, task.task_type, exclude=id)})
        self._write(task)
        return task

    def set_done(self, id: str, done: bool) -> Task:
        task = self.get(id)
        if done and task.status != Status.DONE:
            return self.update(id, TaskChanges(status=Status.DONE))
        if not done and task.status == Status.DONE:
            return self.update(id, TaskChanges(status=task.status_before_done or Status.NOT_STARTED))
        return task

    def move(self, id: str, project_id: str, task_type: TaskType, index: int) -> list[Task]:
        self._ensure_loaded()
        self._check_project_id(project_id)
        task = self.get(id)
        source = (task.project_id, task.task_type)
        moved = task.model_copy(
            update={"project_id": project_id, "task_type": task_type, "updated_at": utcnow()}
        )
        cell = self._cell(project_id, task_type, exclude=id)
        cell.insert(max(0, min(index, len(cell))), moved)
        result = self._renumber(cell, force={id})
        if source != (project_id, task_type):
            self._renumber(self._cell(source[0], source[1], exclude=id), force=set())
        return result

    def _renumber(self, cell: list[Task], force: set[str]) -> list[Task]:
        out = []
        for i, t in enumerate(cell):
            if t.order != i or t.id in force:
                t = t.model_copy(update={"order": i})
                self._write(t)
            out.append(t)
        return out

    def delete(self, id: str) -> None:
        self._ensure_loaded()
        if not is_uuid(id):
            raise TaskNotFound(id)
        path = self._path(id)
        if not path.is_file():
            raise TaskNotFound(id)
        self._trash_dir.mkdir(parents=True, exist_ok=True)
        os.replace(path, self._trash_dir / path.name)
        self._tasks.pop(id, None)

    def restore(self, id: str) -> Task:
        self._ensure_loaded()
        if not is_uuid(id):
            raise TaskNotFound(id)
        src = self._trash_dir / f"{id}.json"
        if not src.is_file():
            raise TaskNotFound(id)
        if self._path(id).exists():
            raise ValueError(f"a task with id {id} already exists")
        try:
            task = self._complete(read_json(src))
        except (ValueError, OSError) as e:
            raise ValueError(f"trashed task is unreadable: {e}") from e
        if task is None or task.id != id:
            raise ValueError("trashed task is not a valid task file")
        self._tasks_dir.mkdir(parents=True, exist_ok=True)
        os.replace(src, self._path(id))
        self._tasks[id] = task
        return task

    def empty_trash(self) -> int:
        if not self._trash_dir.is_dir():
            return 0
        count = 0
        for p in self._trash_dir.glob("*.json"):
            if p.is_file():
                p.unlink()
                count += 1
        return count

    def reassign_open(self, from_project: str, to_project: str) -> int:
        """Move every not-done task of one project to the end of the same cell in another."""
        self._ensure_loaded()
        self._check_project_id(from_project)
        self._check_project_id(to_project)
        open_tasks = sorted(
            (t for t in self._tasks.values() if t.project_id == from_project and t.status != Status.DONE),
            key=lambda t: t.order,
        )
        now = utcnow()
        for t in open_tasks:
            order = self._next_order(to_project, t.task_type)
            self._write(t.model_copy(update={"project_id": to_project, "order": order, "updated_at": now}))
        return len(open_tasks)
