import pytest

from todoapp.models import new_id


def _project(client, name="Twin Pilot"):
    return client.post("/api/projects", json={"name": name}).json()["id"]


def test_create_tick_move_delete_flow(client):
    pid = client.post("/api/projects", json={"name": "Twin Pilot"}).json()["id"]
    t = client.post("/api/tasks", json={"title": "Chase Sam", "project_id": pid, "task_type": "quick"}).json()
    assert client.post(f"/api/tasks/{t['id']}/done", json={"done": True}).json()["status"] == "done"
    cell = client.post(f"/api/tasks/{t['id']}/move", json={"project_id": pid, "task_type": "urgent", "index": 0}).json()
    assert cell[0]["id"] == t["id"] and cell[0]["task_type"] == "urgent"
    assert client.delete(f"/api/tasks/{t['id']}").status_code == 204
    assert client.get("/api/state").json()["tasks"] == []
    assert client.post(f"/api/tasks/{t['id']}/restore").json()["title"] == "Chase Sam"


def test_create_needs_only_a_title(client):
    r = client.post("/api/tasks", json={"title": "Just this"})
    assert r.status_code == 201
    body = r.json()
    assert body["project_id"] is None and body["task_type"] == "general"
    assert isinstance(body["created_at"], str)


def test_empty_title_is_422(client):
    assert client.post("/api/tasks", json={"title": "   "}).status_code == 422
    assert client.post("/api/tasks", json={}).status_code == 422


def test_unknown_task_404_and_bad_id_404(client):
    assert client.patch(f"/api/tasks/{new_id()}", json={"title": "x"}).status_code == 404
    assert client.patch("/api/tasks/..%2F..%2Fsecret", json={"title": "x"}).status_code == 404


@pytest.mark.parametrize(
    "method, path, body",
    [
        ("patch", "", {"title": "x"}),
        ("post", "/done", {"done": True}),
        ("post", "/move", {"project_id": None, "task_type": "quick", "index": 0}),
        ("delete", "", None),
        ("post", "/restore", None),
    ],
)
def test_every_task_route_404s_on_unknown_task(client, method, path, body):
    for task_id in (new_id(), "not-a-uuid"):
        kwargs = {"json": body} if body is not None else {}
        assert getattr(client, method)(f"/api/tasks/{task_id}{path}", **kwargs).status_code == 404


def test_patch_distinguishes_null_from_unset(client):
    t = client.post("/api/tasks", json={"title": "A"}).json()
    client.patch(f"/api/tasks/{t['id']}", json={"due_date": "2026-12-01", "description": "keep"})
    r = client.patch(f"/api/tasks/{t['id']}", json={"due_date": None}).json()
    assert r["due_date"] is None and r["description"] == "keep"


def test_patch_empty_title_is_422(client):
    t = client.post("/api/tasks", json={"title": "A"}).json()
    assert client.patch(f"/api/tasks/{t['id']}", json={"title": " "}).status_code == 422


def test_trash_empty(client):
    t = client.post("/api/tasks", json={"title": "A"}).json()
    client.delete(f"/api/tasks/{t['id']}")
    assert client.post("/api/trash/empty").json() == {"removed": 1}
    assert client.post(f"/api/tasks/{t['id']}/restore").status_code == 404


def test_every_write_publishes_on_the_bus(client, monkeypatch):
    calls = []
    monkeypatch.setattr(client.app.state.ctx.bus, "publish", lambda kind="changed": calls.append(kind))
    pid = _project(client)
    t = client.post("/api/tasks", json={"title": "A", "project_id": pid}).json()
    client.patch(f"/api/tasks/{t['id']}", json={"title": "B"})
    client.post(f"/api/tasks/{t['id']}/done", json={"done": True})
    client.post(f"/api/tasks/{t['id']}/move", json={"project_id": pid, "task_type": "quick", "index": 0})
    client.delete(f"/api/tasks/{t['id']}")
    client.post(f"/api/tasks/{t['id']}/restore")
    client.post("/api/trash/empty")
    assert calls == ["changed"] * 8  # project create + 7 task writes
    before = len(calls)
    client.patch(f"/api/tasks/{new_id()}", json={"title": "x"})  # failed write: no event
    assert len(calls) == before
