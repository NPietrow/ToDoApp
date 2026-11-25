"""Dates on which "Plan today" was used, kept in log/planning.json."""

from __future__ import annotations

from datetime import date
from pathlib import Path

from ..fsutil import atomic_write_json, read_json
from .tasks import FileProblem

SCHEMA_VERSION = 1
PLANNING_UNREADABLE = "log/planning.json can't be read — fix it or move it aside"
_REL = "log/planning.json"


class PlanningLog:
    def __init__(self, data_dir: Path):
        self.path = Path(data_dir) / "log" / "planning.json"

    def dates(self) -> list[date]:
        """Sorted, unique dates; [] if the file is missing. ValueError if it can't be used."""
        if not self.path.exists():
            return []
        try:
            raw = read_json(self.path)
            if not isinstance(raw, dict) or raw.get("schema_version") != SCHEMA_VERSION:
                raise ValueError("unsupported schema_version")
            if isinstance(raw["schema_version"], bool):
                raise ValueError("unsupported schema_version")
            return sorted({date.fromisoformat(d) for d in raw["dates"]})
        except (OSError, ValueError, KeyError, TypeError) as e:
            raise ValueError(PLANNING_UNREADABLE) from e

    def add(self, day: date) -> list[date]:
        found = self.dates()  # raises before anything is written if unreadable
        if day not in found:
            found = sorted([*found, day])
            atomic_write_json(
                self.path,
                {"schema_version": SCHEMA_VERSION, "dates": [d.isoformat() for d in found]},
            )
        return found

    def problem(self) -> FileProblem | None:
        try:
            self.dates()
        except ValueError as e:
            return FileProblem(_REL, str(e))
        return None
