from todoapp.palette import PALETTE_KEYS, next_colour


def test_next_colour_skips_used_and_cycles():
    assert next_colour([]) == "sage"
    assert next_colour(["sage", "peach"]) == "lavender"
    assert next_colour(PALETTE_KEYS) == "sage"
