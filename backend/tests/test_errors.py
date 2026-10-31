import os

from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")  # db.py needs it at import

import main

ORIGIN = main.ALLOWED_ORIGINS[0]


@main.app.get("/_test/boom", include_in_schema=False)
async def _boom():
    raise ValueError("unhandled")


def test_unhandled_error_returns_json_with_cors_headers():
    # Without CORS headers the browser hides the 500 and reports a network failure
    client = TestClient(main.app, raise_server_exceptions=False)
    r = client.get("/_test/boom", headers={"Origin": ORIGIN})
    assert r.status_code == 500
    assert r.json() == {"detail": "Something went wrong on our side. Please try again."}
    assert r.headers.get("access-control-allow-origin") == ORIGIN
