"""
Sector and FI ratios through the API (D050): extraction, preview, peer medians, run and report.
AI calls are replaced by fixed figures.

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
from tests.test_fi import FI, FIRM  # noqa: E402

ON, OFF = "fi-on.test", "fi-off.test"
USER = "analyst@corp.com"
PDF = ("statement.pdf", b"%PDF-1.4 test", "application/pdf")
BASE = {k: v for k, v in FIRM.items() if k not in ("sector", "fi")}
SCORED = {**BASE, "revenue": 50_000_000, "priorYearRevenue": 40_000_000, "currentAssets": 60_000_000,
          "currentLiabilities": 50_000_000, "cash": 10_000_000, "ebit": 12_000_000, "ebitda": 13_000_000,
          "totalDebt": 90_000_000, "shortTermDebt": 40_000_000, "longTermDebt": 50_000_000,
          "financeCost": 8_000_000, "totalLiabilities": 105_000_000, "retainedEarnings": 20_000_000}


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

    calls, fail = [], {"fi": False}

    async def fake_figures(blocks):
        calls.append("figures")
        return dict(SCORED)

    async def fake_fi(blocks):
        calls.append("fi")
        if fail["fi"]:
            raise RuntimeError("Claude took too long to respond.")
        return dict(FI)

    async def fake_narrative(figures, ratios, info):
        return {"recommendation": "ok"}

    main.app.dependency_overrides[deps.get_db] = _db
    monkeypatch.setattr(assessment, "extract_figures", fake_figures)
    monkeypatch.setattr(assessment, "extract_fi", fake_fi)
    monkeypatch.setattr(assessment, "generate_narrative", fake_narrative)
    deps.limiter.enabled = False

    _run(_sql("TRUNCATE peer_benchmarks, issuer_periods, issuers, email_allowlist, registrations, otps, "
              "credit_transactions, assessments, users, tenants RESTART IDENTITY CASCADE"))
    ids = {}
    for host, mode in ((ON, "shadow"), (OFF, "off")):
        rows = _run(_sql(
            "INSERT INTO tenants (hostname, client_name, primary_color, primary_hover, accent_color, accent_hover, "
            "accent_rgb, allowed_emails, allowed_domains, session_ttl, fi_mode) "
            "VALUES (:h, :h, '', '', '', '', '', '{}', '{}', 3600, :m) RETURNING id", h=host, m=mode))
        ids[host] = rows[0][0]
        _run(_sql("INSERT INTO users (email, tenant_id, role, plan, credits, verified) "
                  "VALUES (:e, :t, 'user', 'free', 10, true)", e=USER, t=ids[host]))
    for rid, median in (("npl_ratio", 4.8), ("cost_to_income", 53.8)):
        _run(_sql("INSERT INTO peer_benchmarks (sector, ratio_id, fiscal_year, peer_group, median, p25, p75, n) "
                  "VALUES ('financial_services', :r, 2025, 'NGX-listed banks', :m, 3.4, 5.1, 10)", r=rid, m=median))

    with TestClient(main.app) as c:
        c.tenant_ids, c.calls, c.fail = ids, calls, fail
        yield c
    main.app.dependency_overrides.clear()
    deps.limiter.enabled = True
    _run(engine.dispose())


def _auth(c, host):
    return {"Authorization": f"Bearer {auth._create_jwt(USER, c.tenant_ids[host], 3600)}"}


def _extract(c, host, sector="financial_services"):
    data = {"client_name": "Example Finance Ltd"}
    if sector:
        data["sector"] = sector
    return c.post("/assessment/extract", files=[("financial_pdf", PDF)], data=data, headers=_auth(c, host))


def _fi_by_id(fi):
    return {r["id"]: r for r in fi["ratios"]}


def test_tenant_exposes_fi_mode(client):
    assert client.get(f"/tenant/{ON}").json()["fiMode"] == "shadow"
    assert client.get(f"/tenant/{OFF}").json()["fiMode"] == "off"


def test_extract_reads_fi_figures_for_financial_issuer(client):
    res = _extract(client, ON)
    assert res.status_code == 200, res.text
    figs = res.json()["figures"]
    assert figs["sector"] == "financial_services"
    assert figs["fi"]["grossLoans"] == FI["grossLoans"]
    assert sorted(client.calls) == ["fi", "figures"]


def test_other_sector_has_no_fi_read(client):
    figs = _extract(client, ON, sector="manufacturing").json()["figures"]
    assert figs["sector"] == "manufacturing" and "fi" not in figs
    assert client.calls == ["figures"]


def test_unknown_sector_is_ignored(client):
    figs = _extract(client, ON, sector="banks").json()["figures"]
    assert "sector" not in figs and client.calls == ["figures"]


def test_tenant_off_ignores_sector(client):
    figs = _extract(client, OFF).json()["figures"]
    assert "sector" not in figs and "fi" not in figs
    assert client.calls == ["figures"]


def test_failed_fi_read_is_a_warning_not_a_failure(client):
    client.fail["fi"] = True
    res = _extract(client, ON)
    assert res.status_code == 200
    body = res.json()
    assert "could not be read" in body["fiWarning"]
    assert body["figures"]["fi"] == {}


def test_preview_hides_unverified_peers(client):
    fi = client.post("/assessment/preview", headers=_auth(client, ON), json={"figures": FIRM | SCORED}).json()["fi"]
    assert fi["status"] == "ok"
    r = _fi_by_id(fi)
    assert r["npl_ratio"]["value"] == pytest.approx(5.0)
    assert all(x["peer"] is None for x in fi["ratios"])


def test_preview_shows_verified_peers(client):
    _run(_sql("UPDATE peer_benchmarks SET verified = true, verified_at = now()"))
    fi = client.post("/assessment/preview", headers=_auth(client, ON), json={"figures": FIRM | SCORED}).json()["fi"]
    r = _fi_by_id(fi)
    assert r["npl_ratio"]["peer"]["median"] == 4.8 and r["npl_ratio"]["peer"]["n"] == 10
    assert r["nim"]["peer"] is None
    assert fi["peerGroups"] == ["NGX-listed banks"]


def test_preview_off_tenant_has_no_fi(client):
    res = client.post("/assessment/preview", headers=_auth(client, OFF), json={"figures": FIRM | SCORED}).json()
    assert res["fi"] is None


def test_fi_never_changes_the_score(client):
    with_fi = client.post("/assessment/preview", headers=_auth(client, ON), json={"figures": FIRM | SCORED}).json()
    without = client.post("/assessment/preview", headers=_auth(client, OFF), json={"figures": SCORED}).json()
    assert with_fi["total_score"] == without["total_score"]


def test_run_saves_sector_and_fi_and_report_builds(client):
    _run(_sql("UPDATE peer_benchmarks SET verified = true"))
    draft = _extract(client, ON).json()["draftId"]
    res = client.post("/assessment/run", headers=_auth(client, ON), json={
        "figures": FIRM | SCORED, "clientInfo": {"clientName": "Example Finance Ltd", "reviewDate": "12 Nov 2026"},
        "draftId": draft})
    assert res.status_code == 200, res.text
    body = res.json()
    assert _fi_by_id(body["fi"])["npl_ratio"]["peer"]["median"] == 4.8
    row = _run(_sql("SELECT sector, fi FROM assessments WHERE id = :i", i=body["assessmentId"]))[0]
    assert row[0] == "financial_services" and row[1]["status"] == "ok"
    # A later change to the medians never changes the saved result
    _run(_sql("UPDATE peer_benchmarks SET median = 9.9"))
    detail = client.get(f"/assessment/{body['assessmentId']}", headers=_auth(client, ON)).json()
    assert _fi_by_id(detail["fi"])["npl_ratio"]["peer"]["median"] == 4.8
    pdf = client.post("/assessment/report", headers=_auth(client, ON), json={"assessment_id": body["assessmentId"]})
    assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
