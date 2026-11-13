from todoapp.models import new_id


def test_duplicate_project_409(client):
    client.post("/api/projects", json={"name": "X"})
    r = client.post("/api/projects", json={"name": "x"})
    assert r.status_code == 409
    assert r.json()["detail"] == "A project called 'x' already exists"


def test_close_project_moving_open_tasks(client):
    a = client.post("/api/projects", json={"name": "A"}).json()["id"]
    b = client.post("/api/projects", json={"name": "B"}).json()["id"]
    client.post("/api/tasks", json={"title": "t", "project_id": a, "task_type": "general"})
    client.post(f"/api/projects/{a}/close", json={"move_open_to": b})
    assert [t["project_id"] for t in client.get("/api/state").json()["tasks"]] == [b]


def test_close_without_body_and_reopen(client):
    a = client.post("/api/projects", json={"name": "A"}).json()["id"]
    assert client.post(f"/api/projects/{a}/close").json()["status"] == "closed"
    assert client.post(f"/api/projects/{a}/reopen").json()["status"] == "active"


def test_close_rejects_bad_move_targets(client):
    a = client.post("/api/projects", json={"name": "A"}).json()["id"]
    b = client.post("/api/projects", json={"name": "B"}).json()["id"]
    c = client.post("/api/projects", json={"name": "C"}).json()["id"]
    client.post(f"/api/projects/{c}/close")
    client.post("/api/tasks", json={"title": "t", "project_id": a})
    for target in (a, c, "nope"):
        assert client.post(f"/api/projects/{a}/close", json={"move_open_to": target}).status_code == 422
    assert client.post(f"/api/projects/{a}/close", json={"move_open_to": new_id()}).status_code == 404
    # the failed attempts moved nothing and closed nothing
    state = client.get("/api/state").json()
    assert [t["project_id"] for t in state["tasks"]] == [a]
    assert {p["id"]: p["status"] for p in state["projects"]}[a] == "active"
    assert client.post(f"/api/projects/{a}/close", json={"move_open_to": b}).status_code == 200


def test_patch_rename_and_colour(client):
    a = client.post("/api/projects", json={"name": "A"}).json()["id"]
    r = client.patch(f"/api/projects/{a}", json={"name": "Renamed", "colour": "peach"})
    assert r.status_code == 200 and r.json()["name"] == "Renamed"
    assert client.patch(f"/api/projects/{a}", json={}).json() == r.json()
    assert client.patch(f"/api/projects/{a}", json={"colour": "not-a-colour"}).status_code == 422
    assert client.patch(f"/api/projects/{new_id()}", json={"name": "x"}).status_code == 404
    for path in ("", "/move", "/close", "/reopen"):
        method = client.patch if path == "" else client.post
        assert method(f"/api/projects/not-a-uuid{path}", json={"name": "x", "position": 0}).status_code == 404


def test_move_project(client):
    a = client.post("/api/projects", json={"name": "A"}).json()["id"]
    b = client.post("/api/projects", json={"name": "B"}).json()["id"]
    out = client.post(f"/api/projects/{b}/move", json={"position": 0}).json()
    assert [p["id"] for p in out] == [b, a]


def test_project_and_notes_writes_publish(client, monkeypatch):
    calls = []
    monkeypatch.setattr(client.app.state.ctx.bus, "publish", lambda kind="changed": calls.append(kind))
    a = client.post("/api/projects", json={"name": "A"}).json()["id"]
    client.patch(f"/api/projects/{a}", json={"name": "A2"})
    client.post(f"/api/projects/{a}/move", json={"position": 0})
    client.post(f"/api/projects/{a}/close")
    client.post(f"/api/projects/{a}/reopen")
    client.put(f"/api/notes/{a}", json={"text": "x"})
    assert calls == ["changed"] * 6


def test_notes_put(client):
    pid = client.post("/api/projects", json={"name": "A"}).json()["id"]
    r = client.put(f"/api/notes/{pid}", json={"text": "- one"})
    assert r.status_code == 204 and r.content == b""
    assert client.get("/api/state").json()["notes"][pid] == "- one"


def test_notes_on_unknown_project_404(client):
    assert client.put(f"/api/notes/{new_id()}", json={"text": "x"}).status_code == 404
    assert client.put("/api/notes/..%2F..%2Fsecret", json={"text": "x"}).status_code == 404
    assert client.put("/api/notes/not-a-uuid", json={"text": "x"}).status_code == 404
