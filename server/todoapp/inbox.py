"""Import task files dropped into <data>/inbox/ (spec 5.3)."""

from __future__ import annotations

import os
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from .fsutil import is_temp_file
from .intake import normalise_items, parse_strict
from .models import Project
from .normalise import IntakeError
from .store.tasks import FileProblem, TaskRepository


@dataclass
class InboxResult:
    imported: int = 0
    # Files left in the inbox (nothing was imported): reported for this scan only.
    problems: list[FileProblem] = field(default_factory=list)
    # Items skipped from files that were imported, pointing at inbox/processed/<stamped name>.
    skipped: list[FileProblem] = field(default_factory=list)


def _processed_target(processed: Path, name: str, now: datetime) -> Path:
    # The stamp is local time (ruling R8); task fields stay in UTC.
    stamped = f"{now.astimezone().strftime('%Y%m%d-%H%M%S')}-{name}"
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
            items = parse_strict(path.read_text(encoding="utf-8-sig"))
        except (OSError, ValueError, IntakeError) as e:
            result.problems.append(FileProblem(rel, str(e)))
            continue
        valid, errors = normalise_items(items, active, now)
        if not valid:
            result.problems.extend(FileProblem(rel, e) for e in errors)
            continue  # nothing usable: leave the file where it is
        # Claim the file first, so a failed move can never lead to duplicate imports.
        try:
            processed = inbox / "processed"
            processed.mkdir(exist_ok=True)
            target = _processed_target(processed, path.name, now)
            os.replace(path, target)
        except OSError as e:
            result.problems.append(FileProblem(rel, f"could not move file: {e}"))
            result.problems.extend(FileProblem(rel, e) for e in errors)
            continue
        done_rel = f"inbox/processed/{target.name}"
        result.skipped.extend(FileProblem(done_rel, e) for e in errors)
        added = 0
        try:
            for t in valid:
                tasks.add(t)
                added += 1
        except OSError as e:
            result.skipped.append(FileProblem(done_rel, f"imported {added} of {len(valid)} tasks: {e}"))
        result.imported += added
    return result
