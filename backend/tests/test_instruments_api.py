"""
Instrument choice through the API (D052): extraction, bond terms, run and the tenant switch.
AI calls are replaced by fixed results.

Needs a migrated PostgreSQL database (see test_allowlist.py). Skipped when TEST_DATABASE_URL is unset.
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
from api.routes import assessment, auth  # noqa: E402
from tests.test_scoring import STREADVEST  # noqa: E402

ON, OFF = "instr-on.test", "instr-off.test"
USER = "analyst@corp.com"
PDF = ("terms.pdf", b"%PDF-1.4 test", "application/pdf")


def _run(coro):
    return asyncio.run(coro)


async def _sql(stmt: str, **params):
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

    prompts = []

    async def fake_figures(blocks):
        return dict(STREADVEST)

    async def fake_bond_terms(blocks):
        return {"coupon": "18.25%", "maturityDate": "15 June 2031"}

    async def fake_narrative(figures, ratios, info):
        prompts.append(figures.get("instrument"))
        return {"recommendation": "ok"}

    main.app.dependency_overrides[deps.get_db] = _db
    monkeypatch.setattr(assessment, "extract_figures", fake_figures)
    monkeypatch.setattr(assessment, "extract_bond_terms", fake_bond_terms)
    monkeypatch.setattr(assessment, "generate_narrative", fake_narrative)
    deps.limiter.enabled = False

    _run(_sql("TRUNCATE peer_benchmarks, issuer_periods, issuers, email_allowlist, registrations, otps, "
              "credit_transactions, assessments, users, tenants RESTART IDENTITY CASCADE"))
    ids = {}
    for host, mode in ((ON, "on"), (OFF, "off")):
        rows = _run(_sql(
            "INSERT INTO tenants (hostname, client_name, primary_color, primary_hover, accent_color, accent_hover, "
            "accent_rgb, allowed_emails, allowed_domains, session_ttl, instrument_mode) "
            "VALUES (:h, :h, '', '', '', '', '', '{}', '{}', 3600, :m) RETURNING id", h=host, m=mode))
        ids[host] = rows[0][0]
        _run(_sql("INSERT INTO users (email, tenant_id, role, plan, credits, verified) "
                  "VALUES (:e, :t, 'user', 'free', 10, true)", e=USER, t=ids[host]))

    with TestClient(main.app) as c:
        c.tenant_ids, c.prompts = ids, prompts
        yield c
    main.app.dependency_overrides.clear()
    deps.limiter.enabled = True
    _run(engine.dispose())


def _auth(c, host):
    return {"Authorization": f"Bearer {auth._create_jwt(USER, c.tenant_ids[host], 3600)}"}


def _extract(c, host, instrument=None):
    data = {"client_name": "Streadvest Nigeria Limited"}
    if instrument:
        data["instrument"] = instrument
    return c.post("/assessment/extract", files=[("financial_pdf", PDF)], data=data, headers=_auth(c, host))


def _run_assessment(c, host, figures, draft):
    return c.post("/assessment/run", headers=_auth(c, host), json={
        "figures": figures, "clientInfo": {"clientName": "Streadvest Nigeria Limited", "reviewDate": "13 Nov 2026"},
        "draftId": draft})


def test_tenant_exposes_instrument_mode(client):
    assert client.get(f"/tenant/{ON}").json()["instrumentMode"] == "on"
    assert client.get(f"/tenant/{OFF}").json()["instrumentMode"] == "off"


def test_extract_records_instrument(client):
    assert _extract(client, ON, "bond").json()["figures"]["instrument"] == "bond"
    assert _extract(client, ON, "nonsense").json()["figures"]["instrument"] == "cp"
    assert _extract(client, ON).json()["figures"]["instrument"] == "cp"
    assert "instrument" not in _extract(client, OFF, "bond").json()["figures"]


def test_bond_terms_from_a_document(client):
    res = client.post("/assessment/extract-terms", files=[("terms_pdf", PDF)], data={"instrument": "bond"},
                      headers=_auth(client, ON))
    assert res.status_code == 200 and res.json()["terms"]["coupon"] == "18.25%"


def test_terms_reading_refused_for_loans_and_when_off(client):
    loan = client.post("/assessment/extract-terms", files=[("terms_pdf", PDF)], data={"instrument": "loan"},
                       headers=_auth(client, ON))
    assert loan.status_code == 400
    off = client.post("/assessment/extract-terms", files=[("terms_pdf", PDF)], data={"instrument": "bond"},
                      headers=_auth(client, OFF))
    assert off.status_code == 403


def test_run_saves_loan_with_clean_terms_and_same_score(client):
    draft = _extract(client, ON, "loan").json()["draftId"]
    figs = {**STREADVEST, "instrument": "loan", "terms": {"amount": " N5bn ", "tenor": "36 months", "junk": "x"}}
    res = _run_assessment(client, ON, figs, draft)
    assert res.status_code == 200, res.text
    body = res.json()
    row = _run(_sql("SELECT instrument, figures FROM assessments WHERE id = :i", i=body["assessmentId"]))[0]
    assert row[0] == "loan"
    assert row[1]["terms"]["amount"] == "N5bn" and "junk" not in row[1]["terms"]
    assert client.prompts[-1] == "loan"
    cp_score = client.post("/assessment/preview", headers=_auth(client, OFF), json={"figures": STREADVEST}).json()
    assert body["totalScore"] == cp_score["total_score"]          # same model for every instrument
    detail = client.get(f"/assessment/{body['assessmentId']}", headers=_auth(client, ON)).json()
    assert detail["instrument"] == "loan"
    pdf = client.post("/assessment/report", headers=_auth(client, ON), json={"assessment_id": body["assessmentId"]})
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"


def test_tenant_off_forces_commercial_paper(client):
    draft = _extract(client, OFF).json()["draftId"]
    res = _run_assessment(client, OFF, {**STREADVEST, "instrument": "bond", "terms": {"coupon": "1%"}}, draft)
    row = _run(_sql("SELECT instrument, figures FROM assessments WHERE id = :i", i=res.json()["assessmentId"]))[0]
    assert row[0] is None and "instrument" not in row[1] and "terms" not in row[1]
    assert client.get(f"/assessment/{res.json()['assessmentId']}", headers=_auth(client, OFF)).json()["instrument"] == "cp"
