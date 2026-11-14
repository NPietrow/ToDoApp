"""With the UI built, unmatched /api paths must still be a JSON 404 (not the static mount's 405)."""

import pytest
from fastapi.testclient import TestClient

from conftest import ORIGIN
from todoapp.app import create_app
from todoapp.config import AppSettings, RuntimeOptions
from todoapp.models import new_id


@pytest.fixture
def built_client(tmp_path):
    static = tmp_path / "static"
    static.mkdir()
    (static / "index.html").write_text("<!doctype html><title>ToDoApp</title>", encoding="utf-8")
    app = create_app(
        AppSettings(data_dir=tmp_path / "data"),
        RuntimeOptions(),
        config_path=tmp_path / "config" / "settings.json",
        static_dir=static,
    )
    with TestClient(app, base_url=ORIGIN, headers={"Origin": ORIGIN}) as c:
        yield c


def test_root_serves_index_html(built_client):
    r = built_client.get("/")
    assert r.status_code == 200
    assert "text/html" in r.headers["content-type"]


def test_real_api_routes_still_win(built_client):
    assert built_client.get("/api/health").status_code == 200


def test_unmatched_api_paths_are_json_404_not_405(built_client):
    r = built_client.patch("/api/tasks/..%2F..%2Fsecret", json={"title": "x"})
    assert r.status_code == 404
    assert r.json() == {"detail": "not found"}
    assert built_client.put(f"/api/notes/{new_id()}", json={"text": "x"}).status_code == 404
    for method in ("get", "post", "put", "patch", "delete"):
        r = getattr(built_client, method)("/api/nonexistent")
        assert r.status_code == 404, method
        assert r.json() == {"detail": "not found"}
        assert "access-control-allow-origin" not in r.headers
