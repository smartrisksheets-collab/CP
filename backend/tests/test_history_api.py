"""
Issuer history through the API: extraction, preview, run, storage and tenant isolation.
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
from api.claude import clean_periods  # noqa: E402
from api.routes import assessment, auth  # noqa: E402
from tests.test_history import FY23, FY24, FY25, H1_25, H1_26  # noqa: E402

SHADOW, OFF, SHADOW_2 = "shadow.test", "off.test", "shadow2.test"
USER = "analyst@corp.com"
PDF = ("statement.pdf", b"%PDF-1.4 test", "application/pdf")
RC = "RC 1234567"


def _run(coro):
    return asyncio.run(coro)


async def _sql(stmt: str, **params):
    engine = create_async_engine(TEST_DB, poolclass=NullPool)
    async with engine.begin() as conn:
        result = await conn.execute(text(stmt), params)
        rows = result.fetchall() if result.returns_rows else None
    await engine.dispose()
    return rows


def _col(end, months, audited, figs):
    return {"periodEnd": end, "periodMonths": months, "audited": audited, "figures": figs}


FY25_OCF = {**{k: v for k, v in FY25.items() if k != "reportingPeriod"}, "operatingCashFlow": 4_600_000}
DOCS = {
    "current": [_col("2025-12-31", 12, True, FY25_OCF), _col("2024-12-31", 12, True, FY24)],
    "prior":   [_col("2024-12-31", 12, True, FY24), _col("2023-12-31", 12, True, FY23)],
    "interim": [_col("30 June 2026", 6, False, H1_26), _col("30 June 2025", 6, False, H1_25)],
}


@pytest.fixture()
def client(monkeypatch):
    engine = create_async_engine(TEST_DB, poolclass=NullPool)
    session = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    async def _db():
        async with session() as s:
            yield s

    calls = []

    async def fake_figures(blocks):
        calls.append("figures")
        return dict(FY25)

    async def fake_periods(blocks, key):
        calls.append(key)
        if key == "older":
            raise RuntimeError("Claude took too long to respond.")
        return clean_periods({"basis": "company", "periods": DOCS[key]}, key)

    async def fake_narrative(figures, ratios, info):
        return {"recommendation": "ok", "historicalReview": "trend" if info.get("history") else None}

    main.app.dependency_overrides[deps.get_db] = _db
    monkeypatch.setattr(assessment, "extract_figures", fake_figures)
    monkeypatch.setattr(assessment, "extract_periods", fake_periods)
    monkeypatch.setattr(assessment, "generate_narrative", fake_narrative)
    deps.limiter.enabled = False

    _run(_sql("TRUNCATE issuer_periods, issuers, email_allowlist, registrations, otps, credit_transactions, "
              "assessments, users, tenants RESTART IDENTITY CASCADE"))
    ids = {}
    for host, mode in ((SHADOW, "shadow"), (OFF, "off"), (SHADOW_2, "shadow")):
        rows = _run(_sql(
            "INSERT INTO tenants (hostname, client_name, primary_color, primary_hover, accent_color, accent_hover, "
            "accent_rgb, allowed_emails, allowed_domains, session_ttl, history_mode) "
            "VALUES (:h, :h, '', '', '', '', '', '{}', '{}', 3600, :m) RETURNING id", h=host, m=mode))
        ids[host] = rows[0][0]
        _run(_sql("INSERT INTO users (email, tenant_id, role, plan, credits, verified) "
                  "VALUES (:e, :t, 'user', 'free', 10, true)", e=USER, t=ids[host]))

    with TestClient(main.app) as c:
        c.tenant_ids, c.calls = ids, calls
        yield c
    main.app.dependency_overrides.clear()
    deps.limiter.enabled = True
    _run(engine.dispose())


def _auth(c, host):
    return {"Authorization": f"Bearer {auth._create_jwt(USER, c.tenant_ids[host], 3600)}"}


def _credits(c, host):
    return _run(_sql("SELECT credits FROM users WHERE tenant_id = :t", t=c.tenant_ids[host]))[0][0]


def _extract(c, host, rc=RC, prior=True, interim=True, older=False):
    files = [("financial_pdf", PDF)]
    if prior:
        files.append(("prior_pdf", PDF))
    if interim:
        files.append(("interim_pdf", PDF))
    if older:
        files.append(("older_pdf", PDF))
    data = {"client_name": "Example Issuer Plc"}
    if rc:
        data["rc_number"] = rc
    return c.post("/assessment/extract", files=files, data=data, headers=_auth(c, host))


def _run_assessment(c, host, figures, draft_id):
    return c.post("/assessment/run", headers=_auth(c, host), json={
        "figures": figures, "clientInfo": {"clientName": "Example Issuer Plc", "reviewDate": "12 Nov 2026"},
        "draftId": draft_id,
    })


def test_tenant_exposes_history_mode(client):
    assert client.get(f"/tenant/{SHADOW}").json()["historyMode"] == "shadow"
    assert client.get(f"/tenant/{OFF}").json()["historyMode"] == "off"


def test_off_tenant_ignores_history_documents(client):
    r = _extract(client, OFF)
    assert r.status_code == 200
    assert "history" not in r.json()["figures"] and "historyWarnings" not in r.json()
    assert client.calls == ["figures"]          # no extra AI calls
    preview = client.post("/assessment/preview", json={"figures": r.json()["figures"]}, headers=_auth(client, OFF))
    assert preview.json()["history"] is None


def test_shadow_extract_builds_history_for_one_credit(client):
    r = _extract(client, SHADOW)
    assert r.status_code == 200, r.text
    body = r.json()
    hist = body["figures"]["history"]
    assert body["historyWarnings"] == [] and body["storedPeriods"] == 0
    assert hist["rcNumber"] == "1234567" and hist["fy0PeriodEnd"] == "2025-12-31"
    assert hist["fy0OperatingCashFlow"] == 4_600_000
    ends = [(p["periodEnd"], p["periodMonths"]) for p in hist["periods"]]
    # One column per period, newest first; FY2024 appears in two documents but once here
    assert ends == [("2026-06-30", 6), ("2025-06-30", 6), ("2024-12-31", 12), ("2023-12-31", 12)]
    assert next(p for p in hist["periods"] if p["periodEnd"] == "2024-12-31")["source"] == "comparative"
    assert _credits(client, SHADOW) == 9
    assert sorted(client.calls) == ["current", "figures", "interim", "prior"]


def test_failed_history_document_is_a_warning_not_a_refund(client):
    r = _extract(client, SHADOW, older=True)
    assert r.status_code == 200
    assert r.json()["historyWarnings"] == ["Older statement could not be read: Claude took too long to respond."]
    assert _credits(client, SHADOW) == 9


def test_preview_run_store_and_reuse(client):
    body = _extract(client, SHADOW).json()
    figs, draft = body["figures"], body["draftId"]

    preview = client.post("/assessment/preview", json={"figures": figs}, headers=_auth(client, SHADOW)).json()
    h = preview["history"]
    assert h["yearsAvailable"] == 3 and h["confidence"] == "full" and h["adjustment"] == -1.0
    assert h["interim"]["triggered"] == 2
    assert preview["total_score"] == assessment.compute_all_ratios(figs)["total_score"]  # score not adjusted

    # A triggered interim needs an analyst comment
    r = _run_assessment(client, SHADOW, figs, draft)
    assert r.status_code == 422
    figs["history"]["analystComment"] = "Seasonal second quarter"
    r = _run_assessment(client, SHADOW, figs, draft)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["history"]["analystComment"] == "Seasonal second quarter"
    assert out["narrative"]["historicalReview"] == "trend"
    assert out["totalScore"] == preview["total_score"]

    saved = client.get(f"/assessment/{out['assessmentId']}", headers=_auth(client, SHADOW)).json()
    assert saved["history"]["adjustment"] == -1.0
    rows = _run(_sql("SELECT rc_number FROM assessments WHERE id = :i", i=out["assessmentId"]))
    assert rows[0][0] == "1234567"

    periods = _run(_sql("SELECT period_end::text, period_months, source FROM issuer_periods ORDER BY period_end"))
    assert [(p[0], p[1]) for p in periods] == [("2023-12-31", 12), ("2024-12-31", 12), ("2025-06-30", 6),
                                              ("2025-12-31", 12), ("2026-06-30", 6)]
    assert dict(((p[0], p[1]), p[2]) for p in periods)[("2025-12-31", 12)] == "current"

    found = client.get("/assessment/issuer/rc-1234567", headers=_auth(client, SHADOW)).json()
    assert found["found"] and found["name"] == "Example Issuer Plc"
    assert [p["label"] for p in found["periods"]][:2] == ["H1 2026", "FY2025"]

    # Other tenants never see it, even with history switched on
    assert client.get("/assessment/issuer/1234567", headers=_auth(client, SHADOW_2)).json()["found"] is False
    assert client.get("/assessment/issuer/1234567", headers=_auth(client, OFF)).json()["found"] is False

    # The next assessment of the same issuer reuses the stored years without new uploads
    again = _extract(client, SHADOW, prior=False, interim=False).json()
    assert again["storedPeriods"] == 5
    h2 = client.post("/assessment/preview", json={"figures": again["figures"]},
                     headers=_auth(client, SHADOW)).json()["history"]
    assert h2["yearsAvailable"] == 3
    assert {y["source"] for y in h2["years"]} >= {"stored", "current"}


def test_newer_statement_restates_stored_year(client):
    body = _extract(client, SHADOW, interim=False).json()
    _run_assessment(client, SHADOW, body["figures"], body["draftId"])

    # A year later the FY2025 statement's FY2024 comparative is restated
    DOCS["current"][1] = _col("2024-12-31", 12, True, {**FY24, "revenue": 40_000_000})
    try:
        body = _extract(client, SHADOW, prior=False, interim=False).json()
        assert body["figures"]["history"]["extractionNotes"][0]["period"] == "FY2024"
        h = client.post("/assessment/preview", json={"figures": body["figures"]},
                        headers=_auth(client, SHADOW)).json()["history"]
        assert any(n["type"] == "restatement" and n["period"] == "FY2024" for n in h["notes"])
        assert _run_assessment(client, SHADOW, body["figures"], body["draftId"]).status_code == 200
    finally:
        DOCS["current"][1] = _col("2024-12-31", 12, True, FY24)
    rows = _run(_sql("SELECT figures->>'revenue', previous_figures->>'revenue' FROM issuer_periods "
                     "WHERE period_end = '2024-12-31'"))
    # Same document date, so the restated comparative replaces the stored figures and keeps the old ones
    assert float(rows[0][0]) == 40_000_000 and float(rows[0][1]) == 44_500_000


def test_run_without_rc_stores_nothing(client):
    body = _extract(client, SHADOW, rc=None, interim=False).json()
    assert body["figures"]["history"]["rcNumber"] is None
    r = _run_assessment(client, SHADOW, body["figures"], body["draftId"])
    assert r.status_code == 200 and r.json()["history"]["yearsAvailable"] == 3
    assert _run(_sql("SELECT count(*) FROM issuers"))[0][0] == 0


def test_history_uploads_over_total_limit_rejected_before_charge(client, monkeypatch):
    monkeypatch.setattr(assessment, "HISTORY_MAX_TOTAL_MB", 0)
    r = _extract(client, SHADOW)
    assert r.status_code == 413 and "together exceed" in r.json()["detail"]
    assert _credits(client, SHADOW) == 10 and client.calls == []


def test_history_reads_limited_to_two_at_once(client, monkeypatch):
    running, peak = 0, 0

    async def slow_periods(blocks, key):
        nonlocal running, peak
        running += 1
        peak = max(peak, running)
        await asyncio.sleep(0.05)
        running -= 1
        return clean_periods({"basis": "company", "periods": DOCS.get(key, [])}, key)

    monkeypatch.setattr(assessment, "extract_periods", slow_periods)
    r = _extract(client, SHADOW, older=True)  # four history reads: current, prior, older, interim
    assert r.status_code == 200 and peak == 2
