import pytest

from api.scoring import CUTOFF_SCORE, MAX_SCORE, compute_all_ratios

# Streadvest Nigeria 2025 audited statement (N'000), from the FAM scoring spec
STREADVEST = {
    "revenue": 6139084, "priorYearRevenue": 3964246, "netIncome": 5010155,
    "ebit": 5110760, "ebitda": 5149452, "cash": 2166073, "currentAssets": 2166073,
    "inventory": 0, "prepaidExpenses": 0, "totalAssets": 14863118,
    "currentLiabilities": 2014456, "totalLiabilities": 2778560,
    "shareholdersEquity": 12084558, "shortTermDebt": 694640, "longTermDebt": 764104,
    "retainedEarnings": 11668666, "shortTermInterestRate": 0.25, "longTermInterestRate": 0.275,
    "financeCost": 85000,
}


def _by_id(result):
    return {r["id"]: r for r in result["ratios"]}


def test_streadvest_regression_v12():
    result = compute_all_ratios(STREADVEST, "v1.2")
    r = _by_id(result)
    assert r["quick_ratio"]["display_value"] == "1.08x" and r["quick_ratio"]["score"] == 1
    assert r["current_ratio"]["display_value"] == "1.08x"
    assert r["cash_ratio"]["display_value"] == "1.08x"
    assert r["interest_coverage"]["display_value"] == "60.13x"
    assert r["dscr"]["score"] == 7
    assert result["total_score"] == 55
    assert result["eligible"] is True


def test_display_only_ratios_never_score():
    r = _by_id(compute_all_ratios(STREADVEST, "v1.2"))
    for rid in ("current_ratio", "cash_ratio"):
        assert r[rid]["display_only"] is True
        assert r[rid]["score"] == 0 and r[rid]["max_score"] == 0


def test_max_score_matches_scored_ratios():
    result = compute_all_ratios(STREADVEST)
    scored_max = sum(r["max_score"] for r in result["ratios"] if not r["display_only"])
    assert scored_max == MAX_SCORE == 56
    assert result["cutoff"] == CUTOFF_SCORE == 34


def test_total_ignores_display_only():
    result = compute_all_ratios(STREADVEST)
    assert result["total_score"] == sum(r["score"] for r in result["ratios"] if not r["display_only"])


@pytest.mark.parametrize("cl", [0, None, "", "abc"])
def test_liquidity_with_missing_current_liabilities(cl):
    r = _by_id(compute_all_ratios({**STREADVEST, "currentLiabilities": cl}))
    # Denominator floors at 1, so no crash and no Error rows
    assert r["current_ratio"]["category"] == "Liquidity"
    assert r["cash_ratio"]["category"] == "Liquidity"


@pytest.mark.parametrize("ca,band", [(500, "< 1.0x"), (1000, "1.0 - 1.5x"), (1499, "1.0 - 1.5x"), (1500, "≥ 1.5x")])
def test_current_ratio_band_edges(ca, band):
    r = _by_id(compute_all_ratios({"currentAssets": ca, "currentLiabilities": 1000}))
    assert r["current_ratio"]["band"] == band


@pytest.mark.parametrize("cash,band", [(199, "< 0.2x"), (200, "0.2 - 0.5x"), (499, "0.2 - 0.5x"), (500, "≥ 0.5x")])
def test_cash_ratio_band_edges(cash, band):
    r = _by_id(compute_all_ratios({"cash": cash, "currentLiabilities": 1000}))
    assert r["cash_ratio"]["band"] == band


def test_string_figures_are_accepted():
    as_strings = {k: str(v) for k, v in STREADVEST.items()}
    assert compute_all_ratios(as_strings, "v1.2")["total_score"] == 55


def test_empty_figures_do_not_crash():
    result = compute_all_ratios({})
    assert len(result["ratios"]) == 12
    assert all(r["category"] != "Error" for r in result["ratios"])


# ── P2: formula fixes and model versions ──────────────────────
from api.scoring import MODELS, MODEL_VERSION, normalise_rates  # noqa: E402


def test_streadvest_v2_totals_53():
    result = compute_all_ratios(STREADVEST, "v2.0")
    r = _by_id(result)
    assert result["total_score"] == 53 and result["max_score"] == 56 and result["cutoff"] == 34
    assert (r["current_ratio"]["score"], r["cash_ratio"]["score"]) == (1, 3)
    assert r["altman_z"]["score"] == 8 and r["dscr"]["score"] == 5


def test_every_model_totals_56():
    for v in MODELS:
        result = compute_all_ratios(STREADVEST, v)
        assert result["max_score"] == 56
        assert sum(x["max_score"] for x in result["ratios"] if not x["display_only"]) == 56


def test_result_records_model_version():
    assert compute_all_ratios(STREADVEST)["model_version"] == MODEL_VERSION == "v2.0"


def test_acid_test_uses_current_assets():
    r = _by_id(compute_all_ratios({"currentAssets": 1500, "cash": 100, "inventory": 200,
                                   "prepaidExpenses": 100, "currentLiabilities": 1000}))
    assert r["quick_ratio"]["display_value"] == "1.20x"


@pytest.mark.parametrize("ebitda", [0, -500, None])
def test_net_debt_to_ebitda_non_positive_ebitda_scores_zero(ebitda):
    r = _by_id(compute_all_ratios({**STREADVEST, "ebitda": ebitda}))
    assert r["debt_to_ebitda"]["score"] == 0
    assert r["debt_to_ebitda"]["display_value"] == "N/M"


def test_net_cash_with_positive_ebitda_keeps_full_points():
    r = _by_id(compute_all_ratios(STREADVEST, "v1.2"))
    assert r["debt_to_ebitda"]["display_value"] == "-0.14x" and r["debt_to_ebitda"]["score"] == 7


def test_debt_free_company():
    f = {**STREADVEST, "shortTermDebt": 0, "longTermDebt": 0, "financeCost": 0}
    r = _by_id(compute_all_ratios(f, "v1.2"))
    assert (r["interest_coverage"]["score"], r["interest_coverage"]["display_value"]) == (6, "No debt")
    assert (r["dscr"]["score"], r["dscr"]["display_value"]) == (7, "No debt")
    assert _by_id(compute_all_ratios(f, "v2.0"))["dscr"]["score"] == 5


def test_debt_without_any_interest_is_not_available():
    f = {**STREADVEST, "financeCost": None, "shortTermInterestRate": None, "longTermInterestRate": None,
         "shortTermDebt": 0}
    r = _by_id(compute_all_ratios(f))
    assert (r["interest_coverage"]["score"], r["interest_coverage"]["display_value"]) == (0, "N/A")


def test_altman_z_prime_streadvest():
    r = _by_id(compute_all_ratios(STREADVEST))
    assert r["altman_z"]["display_value"] == "3.98" and r["altman_z"]["band"] == "> 2.90"


def test_altman_band_edges():
    from api.scoring import _V12, _band
    bands = _V12["altman_z"]["bands"]
    assert _band(1.2299, bands)[0] == "< 1.23"
    assert _band(1.23, bands)[0] == "1.23 - 2.90"
    assert _band(2.90, bands)[0] == "1.23 - 2.90"
    assert _band(2.9001, bands)[0] == "> 2.90"


def test_rates_are_percentages():
    base = {**STREADVEST, "financeCost": None}
    percent = {**base, "shortTermInterestRate": 25, "longTermInterestRate": 27.5, "rateUnit": "percent"}
    legacy  = {**base, "shortTermInterestRate": 0.25, "longTermInterestRate": 0.275}
    assert _by_id(compute_all_ratios(percent))["interest_coverage"]["display_value"] == "13.32x"
    assert _by_id(compute_all_ratios(legacy))["interest_coverage"]["display_value"] == "13.32x"


def test_small_percentage_rate_is_not_read_as_80_percent():
    f = {"shortTermDebt": 1000, "ebit": 100, "shortTermInterestRate": 0.8, "rateUnit": "percent"}
    assert _by_id(compute_all_ratios(f))["interest_coverage"]["display_value"] == "12.50x"


def test_normalise_rates_is_idempotent():
    once = normalise_rates({"shortTermInterestRate": 0.215, "longTermInterestRate": None})
    assert once["shortTermInterestRate"] == 21.5 and once["rateUnit"] == "percent"
    assert normalise_rates(once) == once
