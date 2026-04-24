from dataclasses import dataclass
from typing import Any

CUTOFF_SCORE = 34
MAX_SCORE    = 56


@dataclass
class RatioResult:
    id           : str
    name         : str
    category     : str
    formula      : str
    benchmark    : str
    max_score    : int
    value        : float
    display_value: str
    band         : str
    score        : int
    passed       : bool


def _n(v: Any) -> float:
    try:
        return float(v) if v is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


def _acid_test(f: dict) -> RatioResult:
    numerator   = _n(f.get("cash")) + _n(f.get("inventory")) - _n(f.get("prepaidExpenses"))
    denominator = max(_n(f.get("currentLiabilities")), 1)
    value       = numerator / denominator

    if value < 1:        band, score = "< 1x",     -2
    elif value <= 1.5:   band, score = "1 - 1.5x",  1
    else:                band, score = "> 1.5x",     2

    return RatioResult(
        id="quick_ratio", name="Acid-Test Ratio", category="Liquidity",
        formula="(Cash + Inventory - Prepaid) / Current Liabilities",
        benchmark=">= 1", max_score=2,
        value=value, display_value=f"{value:.2f}x",
        band=band, score=score, passed=score > 0,
    )


def _net_income_margin(f: dict) -> RatioResult:
    value = (_n(f.get("netIncome")) / max(_n(f.get("revenue")), 1)) * 100

    if value < 10:       band, score = "< 10%",      0
    elif value <= 15:    band, score = "10.1 - 15%",  2
    elif value <= 20:    band, score = "15.1 - 20%",  3
    else:                band, score = "> 20%",        4

    return RatioResult(
        id="net_income_margin", name="Net Income Margin", category="Profitability",
        formula="Net Income / Total Revenue x 100",
        benchmark=">= 20%", max_score=4,
        value=value, display_value=f"{value:.1f}%",
        band=band, score=score, passed=score > 0,
    )


def _revenue_growth(f: dict) -> RatioResult:
    prior = _n(f.get("priorYearRevenue"))

    if prior <= 0:
        return RatioResult(
            id="revenue_growth", name="Revenue Growth Rate", category="Profitability",
            formula="(Current Revenue - Prior Year Revenue) / Prior Year Revenue x 100",
            benchmark="> 15%", max_score=5,
            value=0, display_value="N/A",
            band="N/A", score=0, passed=False,
        )

    value = ((_n(f.get("revenue")) - prior) / prior) * 100

    if value < 0:        band, score = "Negative", -3
    elif value <= 5:     band, score = "0 - 5%",    1
    elif value <= 15:    band, score = "6 - 15%",   2
    elif value <= 30:    band, score = "16 - 30%",  3
    else:                band, score = "> 30%",      5

    return RatioResult(
        id="revenue_growth", name="Revenue Growth Rate", category="Profitability",
        formula="(Current Revenue - Prior Year Revenue) / Prior Year Revenue x 100",
        benchmark="> 15%", max_score=5,
        value=value, display_value=f"{value:.1f}%",
        band=band, score=score, passed=score > 0,
    )


def _return_on_assets(f: dict) -> RatioResult:
    value = (_n(f.get("netIncome")) / max(_n(f.get("totalAssets")), 1)) * 100

    if value < 10:       band, score = "< 10%",      1
    elif value <= 15:    band, score = "10.1 - 15%",  2
    elif value <= 20:    band, score = "15.1 - 20%",  3
    elif value <= 30:    band, score = "20.1 - 30%",  4
    else:                band, score = "> 30%",        5

    return RatioResult(
        id="return_on_assets", name="Return on Assets", category="Returns",
        formula="Net Income / Total Assets x 100",
        benchmark=">= 15%", max_score=5,
        value=value, display_value=f"{value:.1f}%",
        band=band, score=score, passed=score > 0,
    )


def _debt_to_assets(f: dict) -> RatioResult:
    total_debt = _n(f.get("shortTermDebt")) + _n(f.get("longTermDebt"))
    value      = (total_debt / max(_n(f.get("totalAssets")), 1)) * 100

    if value < 30:       band, score = "< 30%",        5
    elif value <= 50:    band, score = "30.1 - 50%",   3
    elif value <= 75:    band, score = "50.1 - 75%",   2
    elif value <= 100:   band, score = "75.1 - 100%",  0
    else:                band, score = "> 100%",       -5

    return RatioResult(
        id="debt_to_assets", name="Debt to Asset Ratio", category="Leverage",
        formula="Total Debt / Total Assets x 100",
        benchmark="< 30%", max_score=5,
        value=value, display_value=f"{value:.1f}%",
        band=band, score=score, passed=score > 0,
    )


def _debt_to_capital(f: dict) -> RatioResult:
    total_debt = _n(f.get("shortTermDebt")) + _n(f.get("longTermDebt"))
    capital    = total_debt + _n(f.get("shareholdersEquity"))
    value      = (total_debt / max(capital, 1)) * 100

    if value < 30:       band, score = "< 30%",        5
    elif value <= 50:    band, score = "30.1 - 50%",   2
    elif value <= 75:    band, score = "50.1 - 75%",   1
    elif value <= 100:   band, score = "75.1 - 100%",  0
    else:                band, score = "> 100%",       -5

    return RatioResult(
        id="debt_to_capital", name="Debt to Capital Ratio", category="Leverage",
        formula="Total Debt / (Total Debt + Shareholders' Equity) x 100",
        benchmark="< 30%", max_score=5,
        value=value, display_value=f"{value:.1f}%",
        band=band, score=score, passed=score > 0,
    )


def _interest_coverage(f: dict) -> RatioResult:
    interest = (
        _n(f.get("shortTermDebt")) * _n(f.get("shortTermInterestRate")) +
        _n(f.get("longTermDebt"))  * _n(f.get("longTermInterestRate"))
    )

    if interest <= 0:
        return RatioResult(
            id="interest_coverage", name="Interest Coverage Ratio", category="Coverage",
            formula="EBIT / Interest Expense",
            benchmark=">= 3.0x", max_score=6,
            value=999, display_value="N/A",
            band="No debt", score=6, passed=True,
        )

    value = _n(f.get("ebit")) / interest

    if value < 1.0:      band, score = "< 1.0x",     -5
    elif value <= 1.5:   band, score = "1.0 - 1.5x",  2
    elif value <= 3.0:   band, score = "1.6 - 3.0x",  4
    elif value <= 5.0:   band, score = "3.1 - 5.0x",  5
    else:                band, score = "> 5.0x",       6

    return RatioResult(
        id="interest_coverage", name="Interest Coverage Ratio", category="Coverage",
        formula="EBIT / Interest Expense",
        benchmark=">= 3.0x", max_score=6,
        value=value, display_value=f"{value:.2f}x",
        band=band, score=score, passed=score > 0,
    )


def _dscr(f: dict) -> RatioResult:
    total_debt = _n(f.get("shortTermDebt")) + _n(f.get("longTermDebt"))
    value      = (_n(f.get("ebitda")) / total_debt) if total_debt > 0 else 0

    if value < 0.5:      band, score = "< 0.5x",      -5
    elif value <= 1:     band, score = "0.6 - 1.0x",   2
    elif value <= 3.5:   band, score = "1.1 - 3.5x",   3
    elif value <= 4:     band, score = "3.6 - 4.0x",   4
    else:                band, score = "> 4.1x",        7

    return RatioResult(
        id="dscr", name="Debt Service Coverage Ratio", category="Coverage",
        formula="EBITDA / Total Debt",
        benchmark=">= 1.5x", max_score=7,
        value=value, display_value=f"{value:.2f}x",
        band=band, score=score, passed=score > 0,
    )


def _debt_to_ebitda(f: dict) -> RatioResult:
    total_debt = _n(f.get("shortTermDebt")) + _n(f.get("longTermDebt"))
    net_debt   = total_debt - _n(f.get("cash"))
    ebitda     = _n(f.get("ebitda"))
    value      = (net_debt / ebitda) if ebitda > 0 else 0

    if value < 2:        band, score = "< 2x",        7
    elif value <= 3:     band, score = "2.1 - 3.0x",  3
    elif value <= 3.5:   band, score = "3.1 - 3.5x",  2
    elif value <= 4:     band, score = "3.6 - 4.0x",  0
    else:                band, score = "> 4.1x",      -5

    return RatioResult(
        id="debt_to_ebitda", name="Debt to EBITDA", category="Coverage",
        formula="Net Debt (Total Debt - Cash) / EBITDA",
        benchmark="Lower is better", max_score=7,
        value=value, display_value=f"{value:.2f}x",
        band=band, score=score, passed=score > 0,
    )


def _altman_z(f: dict) -> RatioResult:
    ta    = max(_n(f.get("totalAssets")), 1)
    wc    = _n(f.get("currentAssets")) - _n(f.get("currentLiabilities"))
    A     = wc / ta
    B     = _n(f.get("retainedEarnings"))   / ta
    C     = _n(f.get("ebit"))               / ta
    D     = _n(f.get("shareholdersEquity")) / max(_n(f.get("totalLiabilities")), 1)
    E     = _n(f.get("revenue"))            / ta
    value = (1.2 * A) + (1.4 * B) + (3.3 * C) + (0.6 * D) + (1.0 * E)

    if value < 1.8:      band, score = "< 1.8",     -10
    elif value <= 2.9:   band, score = "1.8 - 2.9",   5
    else:                band, score = "> 3",          10

    return RatioResult(
        id="altman_z", name="Altman Z-Score", category="Bankruptcy",
        formula="1.2A + 1.4B + 3.3C + 0.6D + 1.0E",
        benchmark=">= 3", max_score=10,
        value=value, display_value=f"{value:.2f}",
        band=band, score=score, passed=score > 0,
    )


# ── Public entry point ────────────────────────────────────────
def compute_all_ratios(figures: dict) -> dict:
    """
    Accepts raw figures dict, returns ratios list + totals.
    This is the single source of truth — never run scoring on the frontend.
    """
    computers = [
        _acid_test,
        _net_income_margin,
        _revenue_growth,
        _return_on_assets,
        _debt_to_assets,
        _debt_to_capital,
        _interest_coverage,
        _dscr,
        _debt_to_ebitda,
        _altman_z,
    ]

    ratios = []
    for fn in computers:
        try:
            ratios.append(fn(figures))
        except Exception as e:
            # Never let one bad ratio crash the whole assessment
            ratios.append(RatioResult(
                id=fn.__name__, name=fn.__name__, category="Error",
                formula="", benchmark="", max_score=0,
                value=0, display_value="Error",
                band="Error", score=0, passed=False,
            ))

    total_score = sum(r.score for r in ratios)
    eligible    = total_score >= CUTOFF_SCORE

    return {
        "ratios"     : [r.__dict__ for r in ratios],
        "total_score": total_score,
        "max_score"  : MAX_SCORE,
        "cutoff"     : CUTOFF_SCORE,
        "eligible"   : eligible,
    }