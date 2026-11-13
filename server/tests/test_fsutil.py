import pytest

from todoapp.fsutil import atomic_write_json, is_temp_file, read_json


def test_atomic_write_then_read(tmp_path):
    p = tmp_path / "a" / "x.json"
    atomic_write_json(p, {"t": "£12k"})
    assert read_json(p) == {"t": "£12k"}
    assert [f.name for f in p.parent.iterdir()] == ["x.json"]  # no temp file left behind


def test_read_json_accepts_bom(tmp_path):
    p = tmp_path / "b.json"
    p.write_bytes(b'\xef\xbb\xbf{"title": "x"}\r\n')
    assert read_json(p) == {"title": "x"}


@pytest.mark.parametrize("name,expected", [
    (".x.json.1a2b.tmp", True), ("~$x.json", True), ("x.json.partial", True),
    ("x.crdownload", True), ("x.json", False)])
def test_is_temp_file(name, expected):
    assert is_temp_file(name) is expected
