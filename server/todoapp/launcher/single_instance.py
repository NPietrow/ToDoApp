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


def request_show(port: int, timeout: float = 2.0) -> bool:
    """Ask the ToDoApp already running on `port` to show its window. True if it agreed.

    A second exe launch uses this instead of opening a window itself, so every window launch
    goes through the running instance's guard against opening two.
    """
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=timeout)
    try:
        conn.request("POST", "/api/window/show", headers={"Origin": f"http://127.0.0.1:{port}"})
        resp = conn.getresponse()
        resp.read(65536)
        return resp.status == 204
    except (OSError, http.client.HTTPException):
        return False
    finally:
        conn.close()
