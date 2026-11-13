def test_intake_preview_then_import(client):
    client.post("/api/projects", json={"name": "Line 4 Bid"})
    text = 'Here you go: [{"title": "Send NDA", "project": "Line 4 Bid"}, {"title": "Book room"}]'
    pv = client.post("/api/intake/preview", json={"text": text}).json()
    assert [i["project_name"] for i in pv["items"]] == ["Line 4 Bid", None]
    assert len(client.post("/api/intake/import", json={"text": text}).json()["imported"]) == 2


def test_import_reports_skipped_items(client):
    text = '[{"title": "Good"}, {"title": "Fine"}, {"description": "no title"}]'
    pv = client.post("/api/intake/preview", json={"text": text}).json()
    out = client.post("/api/intake/import", json={"text": text}).json()
    assert [t["title"] for t in out["imported"]] == ["Good", "Fine"]
    assert out["errors"] == pv["errors"] == ["Item 3: missing title"]
    assert len(client.get("/api/state").json()["tasks"]) == 2


def test_nothing_extractable_is_422(client):
    for path in ("preview", "import"):
        assert client.post(f"/api/intake/{path}", json={"text": "just prose"}).status_code == 422


def test_import_publishes_once_and_preview_never(client, monkeypatch):
    calls = []
    monkeypatch.setattr(client.app.state.ctx.bus, "publish", lambda kind="changed": calls.append(kind))
    client.post("/api/intake/preview", json={"text": '[{"title": "A"}]'})
    assert calls == []
    client.post("/api/intake/import", json={"text": '[{"title": "A"}]'})
    assert calls == ["changed"]
