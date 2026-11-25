DAY = "2026-11-25"


def _pinned(client, n):
    ids = []
    for i in range(n):
        t = client.post("/api/tasks", json={"title": f"t{i}"}).json()
        r = client.patch(f"/api/tasks/{t['id']}", json={"planned_for": DAY})
        assert r.status_code == 200
        ids.append(t["id"])
    return ids


def test_reorder_endpoint_returns_list_in_new_order(client):
    ids = _pinned(client, 3)
    r = client.post("/api/today/reorder", json={"date": DAY, "ids": ids[::-1]})
    assert r.status_code == 200
    assert [t["id"] for t in r.json()] == ids[::-1]


def test_reorder_endpoint_422_for_unpinned(client):
    ids = _pinned(client, 2)
    x = client.post("/api/tasks", json={"title": "x"}).json()["id"]
    r = client.post("/api/today/reorder", json={"date": DAY, "ids": [ids[1], x]})
    assert r.status_code == 422
    tasks = client.get("/api/state").json()["tasks"]
    order = {t["id"]: t["today_order"] for t in tasks}
    assert (order[ids[0]], order[ids[1]]) == (0, 1)


def test_patch_planned_for_assigns_today_order(client):
    a, b = (client.post("/api/tasks", json={"title": n}).json()["id"] for n in "ab")
    ra = client.patch(f"/api/tasks/{a}", json={"planned_for": DAY}).json()
    rb = client.patch(f"/api/tasks/{b}", json={"planned_for": DAY}).json()
    assert (ra["today_order"], rb["today_order"]) == (0, 1)
