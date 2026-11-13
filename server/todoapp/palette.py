"""Fixed project colour palette (keys only; the UI owns the actual colours)."""

from __future__ import annotations

from collections.abc import Iterable

PALETTE_KEYS: tuple[str, ...] = (
    "sage", "lavender", "peach", "sky", "butter",
    "rose", "mint", "lilac", "sand", "aqua",
)


def next_colour(used: Iterable[str]) -> str:
    used = list(used)
    taken = set(used)
    for key in PALETTE_KEYS:
        if key not in taken:
            return key
    return PALETTE_KEYS[len(used) % len(PALETTE_KEYS)]
