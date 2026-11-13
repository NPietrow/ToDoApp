import warnings

import pytest

with warnings.catch_warnings():
    # Starlette 1.x warns that its TestClient wants httpx2; httpx still works.
    warnings.filterwarnings("ignore", message=".*httpx.*starlette.testclient.*")
    from fastapi.testclient import TestClient

from todoapp.app import create_app
from todoapp.config import AppSettings, RuntimeOptions

ORIGIN = "http://127.0.0.1:8765"


@pytest.fixture
def make_client(tmp_path):
    """Build a TestClient (lifespan running) for the given runtime options."""
    stack = []

    def _make(runtime: RuntimeOptions | None = None, **settings):
        settings.setdefault("data_dir", tmp_path / "data")
        app = create_app(
            AppSettings(**settings),
            runtime or RuntimeOptions(),
            config_path=tmp_path / "config" / "settings.json",
        )
        c = TestClient(app, base_url=ORIGIN, headers={"Origin": ORIGIN})
        c.__enter__()
        stack.append(c)
        return c

    yield _make
    for c in stack:
        c.__exit__(None, None, None)


@pytest.fixture
def client(make_client):
    return make_client()


@pytest.fixture
def app_and_ctx(tmp_path):
    """The app and its AppContext, built like `client` but without running the lifespan."""
    app = create_app(
        AppSettings(data_dir=tmp_path / "data"),
        RuntimeOptions(),
        config_path=tmp_path / "config" / "settings.json",
    )
    return app, app.state.ctx
