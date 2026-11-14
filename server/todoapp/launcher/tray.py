"""Tray icon with Open and Quit. The same drawing is the exe's icon (packaging/icon.ico)."""

from __future__ import annotations

from collections.abc import Callable

from PIL import Image, ImageDraw

SAGE = "#7fb069"  # the sage palette accent


def make_icon_image(size: int = 64) -> Image.Image:
    """A sage rounded square with a white tick, drawn at 4x and scaled down for smooth edges."""
    big = size * 4
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = big * 0.06
    draw.rounded_rectangle((pad, pad, big - pad, big - pad), radius=big * 0.22, fill=SAGE)
    tick = [(big * 0.27, big * 0.52), (big * 0.43, big * 0.68), (big * 0.74, big * 0.35)]
    draw.line(tick, fill="white", width=round(big * 0.11), joint="curve")
    r = big * 0.055  # round the two open ends of the tick
    for x, y in (tick[0], tick[-1]):
        draw.ellipse((x - r, y - r, x + r, y + r), fill="white")
    return img.resize((size, size), Image.Resampling.LANCZOS)


def run_tray(on_open: Callable[[], None], on_quit: Callable[[], None]) -> None:
    """Show the tray icon and block until Quit is chosen."""
    import pystray

    def _open(icon, item):
        on_open()

    def _quit(icon, item):
        on_quit()
        icon.stop()

    menu = pystray.Menu(
        pystray.MenuItem("Open", _open, default=True),
        pystray.MenuItem("Quit", _quit),
    )
    pystray.Icon("ToDoApp", make_icon_image(64), "ToDoApp", menu).run()
