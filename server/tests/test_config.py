import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from todoapp.config import (
    AppSettings,
    default_config_path,
    default_data_dir,
    load_settings,
    runtime_options,
    save_settings,
)


def test_defaults_when_missing(tmp_path):
    s = load_settings(tmp_path / "settings.json", env={})
    assert s.port == 8765 and s.text_size == "medium" and s.data_dir == default_data_dir()


def test_env_overrides_and_round_trip(tmp_path):
    p = tmp_path / "settings.json"
    save_settings(AppSettings(data_dir=tmp_path / "d", collapsed_rows=["objective"]), p)
    s = load_settings(p, env={"TODOAPP_DATA_DIR": "/data", "TODOAPP_PORT": "9000"})
    assert s.data_dir == Path("/data") and s.port == 9000 and s.collapsed_rows == ["objective"]


def test_corrupt_file_gives_defaults(tmp_path):
    p = tmp_path / "settings.json"
    p.write_text("{nope")
    assert load_settings(p, env={}).port == 8765
    assert p.read_text() == "{nope"  # never rewritten or deleted


def test_invalid_schema_gives_defaults(tmp_path):
    p = tmp_path / "settings.json"
    p.write_text(json.dumps({"port": 99999, "text_size": "huge"}))
    s = load_settings(p, env={})
    assert s.port == 8765 and s.text_size == "medium"
    assert p.exists()


def test_invalid_env_ignored(tmp_path):
    p = tmp_path / "settings.json"
    save_settings(AppSettings(data_dir=tmp_path / "d", port=9100), p)
    for bad in ("abc", "0", "70000", ""):
        assert load_settings(p, env={"TODOAPP_PORT": bad}).port == 9100


def test_save_serialises_data_dir_as_string_and_creates_parents(tmp_path):
    p = tmp_path / "a" / "b" / "settings.json"
    save_settings(AppSettings(data_dir=tmp_path / "d"), p)
    raw = json.loads(p.read_text())
    assert raw["data_dir"] == str(tmp_path / "d")


def test_port_range_validated():
    for bad in (0, 65536, -1):
        with pytest.raises(ValidationError):
            AppSettings(data_dir=Path("x"), port=bad)


def test_default_config_path():
    p = default_config_path()
    assert p.name == "settings.json" and p.parent.name == "ToDoApp"


def test_runtime_options():
    r = runtime_options({"TODOAPP_HOST": "0.0.0.0", "TODOAPP_PUBLIC_PORT": "9000"})
    assert (r.bind_host, r.public_port, r.windows_app) == ("0.0.0.0", 9000, False)


def test_runtime_options_defaults_and_invalid():
    r = runtime_options({"TODOAPP_PUBLIC_PORT": "abc"}, frozen=True)
    assert (r.bind_host, r.public_port, r.windows_app) == ("127.0.0.1", None, True)
    assert runtime_options({"TODOAPP_PUBLIC_PORT": "70000"}).public_port is None
