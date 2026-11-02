"""
Admin test-email allowlist: registration, revoke and access blocking.

Needs a migrated PostgreSQL database (JSONB/ARRAY, so not SQLite):
    TEST_DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/db
    (run alembic upgrade head against it first). Skipped when unset.
"""
import asyncio
import os

import pytest

TEST_DB = os.getenv("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not TEST_DB, reason="TEST_DATABASE_URL not set")

os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("DATABASE_URL", TEST_DB or "postgresql+asyncpg://test:test@localhost/test")

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

import main  # noqa: E402
from api import deps  # noqa: E402
from api.allowlist import normalize_email  # noqa: E402
from api.routes import auth, register  # noqa: E402

HOST_A, HOST_B = "a.test", "b.test"
ADMIN, ADMIN_B, USER = "admin@corp.com", "admin@other.com", "analyst@corp.com"


def _run(coro):
    return asyncio.run(coro)


async def _sql(stmt: str, **params):
    # NullPool: no connection outlives the event loop that opened it
    engine = create_async_engine(TEST_DB, poolclass=NullPool)
    async with engine.begin() as conn:
        result = await conn.execute(text(stmt), params)
        rows = result.fetchall() if result.returns_rows else None
    await engine.dispose()
    return rows


@pytest.fixture()
def client(monkeypatch):
    engine = create_async_engine(TEST_DB, poolclass=NullPool)
    session = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    async def _db():
        async with session() as s:
            yield s

    async def _no_email(*args, **kwargs):
        return None

    main.app.dependency_overrides[deps.get_db] = _db
    monkeypatch.setattr(register, "_send_verification_email", _no_email)
    monkeypatch.setattr(auth, "_send_otp_email", _no_email)
    deps.limiter.enabled = False

    _run(_sql("TRUNCATE email_allowlist, registrations, otps, credit_transactions, assessments, users, tenants RESTART IDENTITY CASCADE"))
    ids = {}
    for host in (HOST_A, HOST_B):
        rows = _run(_sql(
            "INSERT INTO tenants (hostname, client_name, primary_color, primary_hover, accent_color, accent_hover, "
            "accent_rgb, allowed_emails, allowed_domains, session_ttl) "
            "VALUES (:h, :h, '', '', '', '', '', '{}', '{}', 3600) RETURNING id", h=host))
        ids[host] = rows[0][0]
    for email, host, role in ((ADMIN, HOST_A, "admin"), (ADMIN_B, HOST_B, "admin"), (USER, HOST_A, "user")):
        _run(_sql(
            "INSERT INTO users (email, tenant_id, role, plan, credits, verified) VALUES (:e, :t, :r, 'free', 0, true)",
            e=email, t=ids[host], r=role))

    with TestClient(main.app) as c:
        c.tenant_ids = ids
        yield c
    main.app.dependency_overrides.clear()
    deps.limiter.enabled = True
    _run(engine.dispose())


def _auth(c, email, host=HOST_A):
    token = auth._create_jwt(email, c.tenant_ids[host], 3600)
    return {"Authorization": f"Bearer {token}"}


def _register(c, email, host=HOST_A):
    return c.post("/auth/register", json={"email": email, "name": "Test", "hostname": host})


def _verify(c, email, host=HOST_A):
    rows = _run(_sql(
        "SELECT verification_token FROM registrations WHERE email = :e AND tenant_id = :t",
        e=email, t=c.tenant_ids[host]))
    return c.post("/auth/verify-email", json={"token": rows[0][0]})


def test_normalize_email():
    assert normalize_email("  John+Test@Gmail.com ") == "john@gmail.com"
    for bad in ("", "nobody", "a@b", "@gmail.com", "+x@gmail.com"):
        with pytest.raises(ValueError):
            normalize_email(bad)
    with pytest.raises(ValueError):
        normalize_email("x@mailinator.com")


def test_personal_email_blocked_until_allowlisted(client):
    assert _register(client, "tester@gmail.com").status_code == 400

    r = client.post("/admin/allowlist", json={"email": "Tester+qa@Gmail.com", "note": "QA"}, headers=_auth(client, ADMIN))
    assert r.status_code == 200
    assert r.json()["email"] == "tester@gmail.com" and r.json()["active"] and not r.json()["hasAccount"]

    assert _register(client, "tester@gmail.com").status_code == 200
    assert _verify(client, "tester@gmail.com").status_code == 200

    rows = client.get("/admin/allowlist", headers=_auth(client, ADMIN)).json()
    assert [(e["email"], e["hasAccount"]) for e in rows] == [("tester@gmail.com", True)]


def test_add_validation(client):
    h = _auth(client, ADMIN)
    assert client.post("/admin/allowlist", json={"email": "x@corp.com"}, headers=h).status_code == 400
    assert client.post("/admin/allowlist", json={"email": "x@mailinator.com"}, headers=h).status_code == 400
    assert client.post("/admin/allowlist", json={"email": ""}, headers=h).status_code == 400
    assert client.post("/admin/allowlist", json={"email": "t@gmail.com"}, headers=h).status_code == 200
    assert client.post("/admin/allowlist", json={"email": "T@GMAIL.com"}, headers=h).status_code == 409


def test_role_scoping(client):
    h = _auth(client, USER)
    assert client.get("/admin/allowlist", headers=h).status_code == 403
    assert client.post("/admin/allowlist", json={"email": "t@gmail.com"}, headers=h).status_code == 403
    assert client.post("/admin/allowlist/revoke", json={"email": "t@gmail.com"}, headers=h).status_code == 403


def test_tenant_isolation(client):
    client.post("/admin/allowlist", json={"email": "t@gmail.com"}, headers=_auth(client, ADMIN))
    assert client.get("/admin/allowlist", headers=_auth(client, ADMIN_B, HOST_B)).json() == []
    assert _register(client, "t@gmail.com", HOST_B).status_code == 400
    r = client.post("/admin/allowlist/revoke", json={"email": "t@gmail.com"}, headers=_auth(client, ADMIN_B, HOST_B))
    assert r.status_code == 404


def test_revoke_blocks_access_and_readd_restores(client):
    h = _auth(client, ADMIN)
    client.post("/admin/allowlist", json={"email": "t@gmail.com"}, headers=h)
    _register(client, "t@gmail.com")
    _verify(client, "t@gmail.com")
    user_h = _auth(client, "t@gmail.com")
    assert client.get("/auth/me", headers=user_h).status_code == 200
    assert client.post("/auth/request-otp", json={"email": "t@gmail.com", "hostname": HOST_A}).status_code == 200

    r = client.post("/admin/allowlist/revoke", json={"email": "t@gmail.com"}, headers=h)
    assert r.status_code == 200 and not r.json()["active"] and r.json()["revokedBy"] == ADMIN
    assert client.post("/admin/allowlist/revoke", json={"email": "t@gmail.com"}, headers=h).status_code == 409

    assert client.get("/auth/me", headers=user_h).status_code == 401
    assert client.post("/auth/request-otp", json={"email": "t@gmail.com", "hostname": HOST_A}).status_code == 403
    # a code sent before the revoke cannot be used
    r = client.post("/auth/verify-otp", json={"email": "t@gmail.com", "hostname": HOST_A, "otp": "000000"})
    assert r.status_code == 403

    assert client.post("/admin/allowlist", json={"email": "t@gmail.com"}, headers=h).status_code == 200
    assert client.get("/auth/me", headers=user_h).status_code == 200


def test_revoke_between_register_and_verify(client):
    h = _auth(client, ADMIN)
    client.post("/admin/allowlist", json={"email": "t@gmail.com"}, headers=h)
    _register(client, "t@gmail.com")
    client.post("/admin/allowlist/revoke", json={"email": "t@gmail.com"}, headers=h)
    assert _verify(client, "t@gmail.com").status_code == 400


def test_cannot_revoke_self_or_unknown(client):
    _run(_sql("UPDATE users SET email = 'boss@gmail.com' WHERE email = :e", e=ADMIN))
    h = _auth(client, "boss@gmail.com")
    client.post("/admin/allowlist", json={"email": "boss@gmail.com"}, headers=h)
    assert client.post("/admin/allowlist/revoke", json={"email": "boss@gmail.com"}, headers=h).status_code == 400
    assert client.post("/admin/allowlist/revoke", json={"email": "nobody@gmail.com"}, headers=h).status_code == 404


def test_legacy_personal_account_without_entry_keeps_access(client):
    _run(_sql("UPDATE users SET email = 'legacy@yahoo.com' WHERE email = :e", e=USER))
    assert client.get("/auth/me", headers=_auth(client, "legacy@yahoo.com")).status_code == 200


def test_me_returns_role(client):
    r = client.get("/auth/me", headers=_auth(client, ADMIN))
    assert r.json()["role"] == "admin"


def test_work_email_unaffected(client):
    assert _register(client, "new@corp.com").status_code == 200


def test_users_list_flags_revoked_and_blocks_promotion(client):
    h = _auth(client, ADMIN)
    client.post("/admin/allowlist", json={"email": "t@gmail.com"}, headers=h)
    _register(client, "t@gmail.com")
    _verify(client, "t@gmail.com")
    client.post("/admin/allowlist/revoke", json={"email": "t@gmail.com"}, headers=h)

    flags = {u["email"]: u["accessRevoked"] for u in client.get("/admin/users", headers=h).json()}
    assert flags["t@gmail.com"] is True and flags[USER] is False
    assert client.post("/admin/users/role", json={"email": "t@gmail.com", "role": "admin"}, headers=h).status_code == 400

    client.post("/admin/allowlist", json={"email": "t@gmail.com"}, headers=h)
    assert client.post("/admin/users/role", json={"email": "t@gmail.com", "role": "admin"}, headers=h).status_code == 200
