import json


def test_health_and_state_empty(client):
    assert client.get("/api/health").json()["app"] == "todoapp"
    s = client.get("/api/state").json()
    assert s["projects"] == [] and s["tasks"] == [] and s["problems"] == [] and s["windows_app"] is False


def test_settings_patch_persists(client, tmp_path):
    assert client.patch("/api/settings", json={"text_size": "large"}).json()["text_size"] == "large"
    assert json.loads((tmp_path / "config" / "settings.json").read_text())["text_size"] == "large"


def test_settings_patch_unknown_key_is_422(client):
    r = client.patch("/api/settings", json={"nope": 1})
    assert r.status_code == 422
    assert client.get("/api/state").json()["settings"]["text_size"] == "medium"


def test_settings_patch_switches_data_dir(client, tmp_path):
    new = tmp_path / "elsewhere"
    r = client.patch("/api/settings", json={"data_dir": str(new)})
    assert r.status_code == 200 and r.json()["data_dir"] == str(new)
    assert new.is_dir()
    assert client.app.state.ctx.tasks._dir == new


def test_state_includes_problems_and_inbox(client, tmp_path):
    (tmp_path / "data/inbox").mkdir(parents=True)
    (tmp_path / "data/inbox/a.json").write_text('{"title": "From inbox"}')
    (tmp_path / "data/tasks").mkdir(parents=True, exist_ok=True)
    (tmp_path / "data/tasks/broken.json").write_text("{")
    client.app.state.ctx.refresh()
    s = client.get("/api/state").json()
    assert [t["title"] for t in s["tasks"]] == ["From inbox"]
    assert [p["file"] for p in s["problems"]] == ["tasks/broken.json"]


def test_corrupt_projects_file_is_reported_not_fatal(make_client, tmp_path):
    (tmp_path / "data").mkdir()
    bad = tmp_path / "data" / "projects.json"
    bad.write_bytes(b"{not json")
    c = make_client()  # startup must survive
    s = c.get("/api/state")
    assert s.status_code == 200
    body = s.json()
    assert body["projects"] == []
    assert [p["file"] for p in body["problems"]] == ["projects.json"]
    assert bad.read_bytes() == b"{not json"
    # writes are refused and the file is untouched
    ctx = c.app.state.ctx
    try:
        ctx.projects.create("X")
        raise AssertionError("expected ValueError")
    except ValueError as e:
        assert "projects.json" in str(e)
    assert bad.read_bytes() == b"{not json"
    # fixing the file clears the problem
    bad.write_text('{"schema_version": 1, "projects": []}')
    ctx.refresh()
    assert c.get("/api/state").json()["problems"] == []
    assert ctx.projects.create("X").name == "X"


def test_patch_does_not_save_run_overrides(tmp_path):
    from fastapi.testclient import TestClient

    from todoapp.app import create_app
    from todoapp.config import AppSettings, RuntimeOptions

    cfg = tmp_path / "config" / "settings.json"
    over = {"data_dir": tmp_path / "once", "port": 8799}
    app = create_app(AppSettings(data_dir=tmp_path / "saved"), RuntimeOptions(), cfg, over)
    origin = "http://127.0.0.1:8799"
    with TestClient(app, base_url=origin, headers={"Origin": origin}) as c:
        assert c.get("/api/state").json()["settings"]["port"] == 8799
        r = c.patch("/api/settings", json={"text_size": "large"})
        assert r.json()["port"] == 8799 and r.json()["data_dir"] == str(tmp_path / "once")
        saved = json.loads(cfg.read_text())
        assert saved["text_size"] == "large"
        assert saved["port"] == 8765 and saved["data_dir"] == str(tmp_path / "saved")
        # an explicit data_dir in the patch is saved and ends that override
        c.patch("/api/settings", json={"data_dir": str(tmp_path / "chosen")})
        assert json.loads(cfg.read_text())["data_dir"] == str(tmp_path / "chosen")
        assert c.app.state.ctx.settings.data_dir == tmp_path / "chosen"


def test_inbox_held_while_projects_unreadable(make_client, tmp_path):
    (tmp_path / "data/inbox").mkdir(parents=True)
    (tmp_path / "data/projects.json").write_text("{bad")
    f = tmp_path / "data/inbox/a.json"
    f.write_text('{"title": "Keep me", "project": "Alpha"}')
    c = make_client()
    assert f.exists() and c.get("/api/state").json()["tasks"] == []
    (tmp_path / "data/projects.json").write_text('{"schema_version": 1, "projects": []}')
    c.app.state.ctx.refresh()
    assert not f.exists()
    assert [t["title"] for t in c.get("/api/state").json()["tasks"]] == ["Keep me"]
