from todoapp.config import RuntimeOptions


def test_rejects_foreign_host(client):
    assert client.get("/api/state", headers={"Host": "evil.example:8765"}).status_code == 403
    r = client.get("/api/health", headers={"Host": "evil.example:8765"})
    assert r.json() == {"detail": "host not allowed"}


def test_host_check_is_case_insensitive(client):
    assert client.get("/api/health", headers={"Host": "LOCALHOST:8765"}).status_code == 200


def test_localhost_with_port_allowed(client):
    assert client.get("/api/health", headers={"Host": "localhost:8765"}).status_code == 200


def test_wrong_port_or_bare_host_rejected(client):
    assert client.get("/api/health", headers={"Host": "127.0.0.1:9999"}).status_code == 403
    assert client.get("/api/health", headers={"Host": "127.0.0.1"}).status_code == 403


def test_public_port_allowed_when_set(make_client):
    c = make_client(RuntimeOptions(public_port=9000))
    assert c.get("/api/health", headers={"Host": "localhost:9000"}).status_code == 200
    r = c.patch(
        "/api/settings",
        json={"text_size": "large"},
        headers={"Host": "localhost:9000", "Origin": "http://localhost:9000"},
    )
    assert r.status_code == 200


def test_public_port_rejected_when_not_set(client):
    assert client.get("/api/health", headers={"Host": "localhost:9000"}).status_code == 403


def test_rejects_cross_origin_write(client):
    r = client.patch("/api/settings", json={"text_size": "large"}, headers={"Origin": "https://evil.example"})
    assert r.status_code == 403
    assert r.json() == {"detail": "origin not allowed"}


def test_rejects_write_without_origin(client):
    r = client.patch("/api/settings", json={"text_size": "large"}, headers={"Origin": ""})
    assert r.status_code == 403


def test_get_without_origin_allowed(client):
    assert client.get("/api/health", headers={"Origin": ""}).status_code == 200


def test_no_cors_headers(client):
    r = client.get("/api/health", headers={"Origin": "https://evil.example"})
    assert not any(k.lower().startswith("access-control-") for k in r.headers)
