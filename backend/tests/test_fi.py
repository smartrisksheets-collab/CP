"""Financial-institution ratios, peer medians and the benchmark loader (D050). No database."""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")  # db.py needs it at import

import pytest  # noqa: E402

from api.benchmarks import MAX_AGE_YEARS, MIN_PEERS, attach_peers, issuer_year, pick_peers  # noqa: E402
from api.fi import FI_SPECS, compute_fi, fi_input_error, is_fi, normalise_sector  # noqa: E402
from scripts.load_benchmarks import summarise  # noqa: E402

FI = {
    "grossLoans": 100_000_000, "priorGrossLoans": 80_000_000, "stage3Loans": 5_000_000,
    "stage3Allowance": 3_000_000, "impairmentCharge": 2_700_000, "interestIncome": 30_000_000,
    "interestExpense": 15_000_000, "operatingIncome": 20_000_000, "operatingExpenses": 9_000_000,
    "interestEarningAssets": 120_000_000, "priorInterestEarningAssets": 100_000_000,
    "liquidAssets": 18_000_000, "customerDeposits": 0, "borrowingsDue12m": 40_000_000,
    "totalBorrowings": 90_000_000, "capitalAdequacyRatio": None, "reportedLiquidityRatio": None,
}
FIRM = {
    "sector": "financial_services", "fi": FI, "reportingPeriod": "31 December 2025",
    "totalAssets": 140_000_000, "priorYearTotalAssets": 120_000_000,
    "netIncome": 6_500_000, "shareholdersEquity": 35_000_000,
}


def _by_id(result):
    return {r["id"]: r for r in result["ratios"]}


def test_sector_codes():
    assert normalise_sector(" Financial_Services ") == "financial_services"
    assert normalise_sector("banks") is None
    assert is_fi(FIRM)
    assert not is_fi({**FIRM, "sector": "fintech_payments"})


def test_not_financial_issuer_has_no_fi_block():
    assert compute_fi({**FIRM, "sector": "manufacturing"}) is None
    assert compute_fi({**FIRM, "sector": None}) is None


def test_no_fi_figures_is_no_data():
    out = compute_fi({**FIRM, "fi": {}})
    assert out["status"] == "no_data" and out["ratios"] == []


def test_fi_ratios_worked_example():
    r = _by_id(compute_fi(FIRM))
    assert list(r) == [rid for rid, *_ in FI_SPECS]
    assert r["liquid_to_st_funding"]["value"] == pytest.approx(45.0)       # 18 / (0 + 40)
    assert r["st_funding_concentration"]["value"] == pytest.approx(44.4444, abs=1e-3)
    assert r["npl_ratio"]["value"] == pytest.approx(5.0)
    assert r["stage3_coverage"]["value"] == pytest.approx(60.0)
    assert r["cost_of_risk"]["value"] == pytest.approx(3.0)                # 2.7 / avg(100, 80)
    assert r["equity_to_assets"]["value"] == pytest.approx(25.0)
    assert r["roaa"]["value"] == pytest.approx(5.0)                        # 6.5 / avg(140, 120)
    assert r["nim"]["value"] == pytest.approx(13.6364, abs=1e-3)           # 15 / avg(120, 100)
    assert r["cost_to_income"]["value"] == pytest.approx(45.0)
    assert r["car"]["display"] == "Not reported" and r["car"]["value"] is None
    assert r["reported_liquidity"]["display"] == "Not reported"
    assert r["npl_ratio"]["display"] == "5.0%"


def test_deposit_taker_counts_deposits_as_short_term_funding():
    r = _by_id(compute_fi({**FIRM, "fi": {**FI, "customerDeposits": 60_000_000}}))
    assert r["liquid_to_st_funding"]["value"] == pytest.approx(18.0)       # 18 / (60 + 40)


def test_missing_prior_year_uses_year_end_and_says_so():
    r = _by_id(compute_fi({**FIRM, "priorYearTotalAssets": None,
                           "fi": {**FI, "priorGrossLoans": None, "priorInterestEarningAssets": None}}))
    assert r["cost_of_risk"]["value"] == pytest.approx(2.7)
    assert "no prior year" in r["cost_of_risk"]["note"]
    assert r["roaa"]["value"] == pytest.approx(6.5 / 140 * 100, abs=1e-3)
    assert r["nim"]["note"]


def test_edge_displays():
    r = _by_id(compute_fi({**FIRM, "fi": {**FI, "stage3Loans": 0, "totalBorrowings": 0, "operatingIncome": -5,
                                          "liquidAssets": 1, "customerDeposits": 0, "borrowingsDue12m": 0}}))
    assert r["stage3_coverage"]["display"] == "No Stage 3 loans"
    assert r["st_funding_concentration"]["display"] == "No borrowings"
    assert r["cost_to_income"]["display"] == "N/M"
    assert r["liquid_to_st_funding"]["display"] == "No short-term funding"
    assert r["npl_ratio"]["value"] == 0


def test_missing_inputs_are_na_not_zero():
    r = _by_id(compute_fi({**FIRM, "fi": {"grossLoans": 100}}))
    assert r["npl_ratio"]["display"] == "N/A" and r["npl_ratio"]["value"] is None


def test_reported_ratios_pass_through():
    r = _by_id(compute_fi({**FIRM, "fi": {**FI, "capitalAdequacyRatio": 18.2, "reportedLiquidityRatio": 45}}))
    assert r["car"]["display"] == "18.2%"
    assert r["reported_liquidity"]["value"] == 45


@pytest.mark.parametrize("fi, msg", [
    ({"capitalAdequacyRatio": 120}, "percentage"),
    ({"grossLoans": -1}, "negative"),
    ({"grossLoans": 10, "stage3Loans": 20}, "Stage 3"),
    ({"borrowingsDue12m": 20, "totalBorrowings": 10}, "12 months"),
])
def test_input_errors(fi, msg):
    assert msg in fi_input_error({"fi": fi})


def test_input_ok():
    assert fi_input_error(FIRM) is None
    assert fi_input_error({}) is None


def _row(rid, year, n=MIN_PEERS, verified=True, median=4.8):
    return {"ratio_id": rid, "fiscal_year": year, "peer_group": "NGX-listed banks", "median": median,
            "p25": 3.4, "p75": 5.1, "n": n, "source_note": "x", "verified": verified}


def test_pick_peers_rules():
    rows = [_row("npl_ratio", 2025), _row("npl_ratio", 2024, median=5.5),
            _row("car", 2025, verified=False), _row("roaa", 2025, n=MIN_PEERS - 1),
            _row("nim", 2025 - MAX_AGE_YEARS - 1)]
    peers = pick_peers(rows, 2025)
    assert set(peers) == {"npl_ratio"}                      # unverified, thin and stale rows are dropped
    assert peers["npl_ratio"]["median"] == 4.8 and peers["npl_ratio"]["fiscalYear"] == 2025
    assert pick_peers([_row("nim", 2020)], None)            # issuer year unknown: no staleness check


def test_issuer_year():
    assert issuer_year(FIRM) == 2025
    assert issuer_year({}) is None


def test_attach_peers():
    fi = compute_fi(FIRM)
    out = attach_peers(fi, pick_peers([_row("npl_ratio", 2025)], 2025))
    r = _by_id(out)
    assert r["npl_ratio"]["peer"]["n"] == MIN_PEERS
    assert r["nim"]["peer"] is None
    assert out["peerGroups"] == ["NGX-listed banks"]
    assert attach_peers(None, {}) is None


def test_loader_summary_and_bad_rows():
    rows = [{"company": f"B{i}", "ratio_id": "npl_ratio", "value": str(v)} for i, v in enumerate((2, 3, 4, 5, 6))]
    s = summarise(rows)["npl_ratio"]
    assert (s["median"], s["p25"], s["p75"], s["n"]) == (4, 3, 5, 5)
    with pytest.raises(ValueError):
        summarise([{"company": "X", "ratio_id": "roe", "value": "1"}])
    with pytest.raises(ValueError):
        summarise([{"company": "X", "ratio_id": "nim", "value": "n/a"}])


def test_shipped_bank_csv_loads():
    import csv
    path = os.path.join(os.path.dirname(__file__), "..", "data", "peer_data_fy2025_banks.csv")
    with open(path, newline="", encoding="utf-8") as fh:
        s = summarise(list(csv.DictReader(fh)))
    assert s["npl_ratio"]["n"] == 10 and s["npl_ratio"]["median"] == pytest.approx(4.8)
    assert s["cost_to_income"]["n"] == 11 and s["cost_to_income"]["median"] == pytest.approx(53.8)
    assert s["reported_liquidity"]["n"] == 5
