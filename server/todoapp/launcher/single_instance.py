"""Is ToDoApp already running on this port? Asks 127.0.0.1 only."""

from __future__ import annotations

import http.client
import json
from typing import Literal


def probe(port: int, timeout: float = 1.0) -> Literal["ours", "other", "free"]:
    """"ours" if ToDoApp answers /api/health, "other" if something else holds the port, else "free"."""
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=timeout)
    try:
        try:
            conn.connect()
        except OSError:
            return "free"
        try:
            conn.request("GET", "/api/health")
            resp = conn.getresponse()
            body = json.loads(resp.read(65536)) if resp.status == 200 else None
        except (OSError, http.client.HTTPException, ValueError):
            return "other"
        return "ours" if isinstance(body, dict) and body.get("app") == "todoapp" else "other"
    finally:
        conn.close()
