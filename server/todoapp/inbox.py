"""Import task files dropped into <data>/inbox/ (spec 5.3)."""

from __future__ import annotations

import os
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from .fsutil import is_temp_file
from .intake import extract_items, normalise_items
from .models import Project
from .normalise import IntakeError
from .store.tasks import FileProblem, TaskRepository


@dataclass
class InboxResult:
    imported: int = 0
    problems: list[FileProblem] = field(default_factory=list)


def _processed_target(processed: Path, name: str, now: datetime) -> Path:
    stamped = f"{now.strftime('%Y%m%d-%H%M%S')}-{name}"
    target = processed / stamped
    stem, suffix = os.path.splitext(stamped)
    n = 0
    while target.exists():
        n += 1
        target = processed / f"{stem}-{n}{suffix}"
    return target


def process_inbox(
    data_dir: Path, tasks: TaskRepository, active: Sequence[Project], now: datetime
) -> InboxResult:
    result = InboxResult()
    inbox = Path(data_dir) / "inbox"
    if not inbox.is_dir():
        return result
    files = sorted(p for p in inbox.glob("*.json") if p.is_file() and not is_temp_file(p.name))
    for path in files:
        rel = f"inbox/{path.name}"
        try:
            text = path.read_text(encoding="utf-8-sig")
            items = extract_items(text)
        except (OSError, ValueError, IntakeError) as e:
            result.problems.append(FileProblem(rel, str(e)))
            continue
        valid, errors = normalise_items(items, active, now)
        result.problems.extend(FileProblem(rel, e) for e in errors)
        if not valid:
            continue  # nothing usable: leave the file where it is
        try:
            for t in valid:
                tasks.add(t)
            processed = inbox / "processed"
            processed.mkdir(exist_ok=True)
            os.replace(path, _processed_target(processed, path.name, now))
        except OSError as e:
            result.problems.append(FileProblem(rel, f"could not import: {e}"))
            continue
        result.imported += len(valid)
    return result
