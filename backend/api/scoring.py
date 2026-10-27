import logging
import math
from dataclasses import dataclass
from typing import Any, Callable

log = logging.getLogger(__name__)

CUTOFF_PCT = 0.60

# Active scoring model. Saved assessments record the version they were scored under.
# v1.2 stays available for back-tests and comparison.
MODEL_VERSION = "v2.0"


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
    display_only : bool = False  # shown for information, never added to the total


def _n(v: Any) -> float:
    try:
        return float(v) if v is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


# ── Interest rates ────────────────────────────────────────────
# Rates are entered and extracted as a percentage (21.5 = 21.5%). Figures saved before
# v1.2 carry no rateUnit and used the old rule: above 1 is a percentage, else a decimal.
RATE_FIELDS = ("shortTermInterestRate", "longTermInterestRate")


def normalise_rates(figures: dict) -> dict:
    """Return figures with both rates as a percentage and rateUnit set. Safe to repeat."""
    if figures.get("rateUnit") == "percent":
        return figures
    f = dict(figures)
    for key in RATE_FIELDS:
        v = f.get(key)
        if v is not None and _n(v) <= 1:
            f[key] = round(_n(v) * 100, 6)
    f["rateUnit"] = "percent"
    return f


def _rate(f: dict, key: str) -> float:
    return _n(normalise_rates(f).get(key)) / 100


# ── Measures: each returns (value, special) ───────────────────
# special is None for a normal value, or one of the states in SPECIAL below.
def _total_debt(f: dict) -> float:
    return _n(f.get("shortTermDebt")) + _n(f.get("longTermDebt"))


def _interest(f: dict) -> float:
    # Reported finance cost is audited and repeatable; debt x rates is only a fallback
    return abs(_n(f.get("financeCost"))) or (
        _n(f.get("shortTermDebt")) * _rate(f, "shortTermInterestRate") +
        _n(f.get("longTermDebt"))  * _rate(f, "longTermInterestRate")
    )


def _cl(f: dict) -> float:
    return max(_n(f.get("currentLiabilities")), 1)


def _acid_test(f):
    quick = _n(f.get("currentAssets")) - _n(f.get("inventory")) - _n(f.get("prepaidExpenses"))
    return quick / _cl(f), None


def _current_ratio(f):
    return _n(f.get("currentAssets")) / _cl(f), None


def _cash_ratio(f):
    return _n(f.get("cash")) / _cl(f), None


def _net_income_margin(f):
    return _n(f.get("netIncome")) / max(_n(f.get("revenue")), 1) * 100, None


def _revenue_growth(f):
    prior = _n(f.get("priorYearRevenue"))
    if prior <= 0:
        return 0, "na"
    return (_n(f.get("revenue")) - prior) / prior * 100, None


def _return_on_assets(f):
    return _n(f.get("netIncome")) / max(_n(f.get("totalAssets")), 1) * 100, None


def _debt_to_assets(f):
    return _total_debt(f) / max(_n(f.get("totalAssets")), 1) * 100, None


def _debt_to_capital(f):
    td = _total_debt(f)
    return td / max(td + _n(f.get("shareholdersEquity")), 1) * 100, None


def _interest_coverage(f):
    interest = _interest(f)
    if interest <= 0:
        return 0, "no_debt" if _total_debt(f) <= 0 else "na"
    return _n(f.get("ebit")) / interest, None


def _dscr(f):
    # Debt service due within 12 months: interest for the year plus short-term debt
    debt_service = _interest(f) + _n(f.get("shortTermDebt"))
    if debt_service <= 0:
        return 0, "no_debt" if _total_debt(f) <= 0 else "na"
    return _n(f.get("ebitda")) / debt_service, None


def _net_debt_to_ebitda(f):
    ebitda = _n(f.get("ebitda"))
    if ebitda <= 0:
        return 0, "negative_ebitda"
    return (_total_debt(f) - _n(f.get("cash"))) / ebitda, None


def _altman_z_prime(f):
    # Altman Z' for private firms: book equity in D, revised weights
    ta = max(_n(f.get("totalAssets")), 1)
    A  = (_n(f.get("currentAssets")) - _n(f.get("currentLiabilities"))) / ta
    B  = _n(f.get("retainedEarnings")) / ta
    C  = _n(f.get("ebit")) / ta
    D  = _n(f.get("shareholdersEquity")) / max(_n(f.get("totalLiabilities")), 1)
    E  = _n(f.get("revenue")) / ta
    return 0.717 * A + 0.847 * B + 3.107 * C + 0.420 * D + 0.998 * E, None


# State -> (display value, band label, points: "max" or a number)
SPECIAL = {
    "na"             : ("N/A",     "Not available",          0),
    "no_debt"        : ("No debt", "No debt",                "max"),
    "negative_ebitda": ("N/M",     "N/M - negative EBITDA",  0),
}


@dataclass(frozen=True)
class RatioSpec:
    id       : str
    name     : str
    category : str
    formula  : str
    measure  : Callable[[dict], tuple[float, str | None]]
    fmt      : str  # "x", "pct" or "plain"


SPECS = [
    RatioSpec("quick_ratio", "Acid-Test Ratio", "Liquidity",
              "(Current Assets - Inventory - Prepaid) / Current Liabilities", _acid_test, "x"),
    RatioSpec("current_ratio", "Current Ratio", "Liquidity",
              "Current Assets / Current Liabilities", _current_ratio, "x"),
    RatioSpec("cash_ratio", "Cash Ratio", "Liquidity",
              "Cash and Cash Equivalents / Current Liabilities", _cash_ratio, "x"),
    RatioSpec("net_income_margin", "Net Income Margin", "Profitability",
              "Net Income / Total Revenue x 100", _net_income_margin, "pct"),
    RatioSpec("revenue_growth", "Revenue Growth Rate", "Profitability",
              "(Current Revenue - Prior Year Revenue) / Prior Year Revenue x 100", _revenue_growth, "pct"),
    RatioSpec("return_on_assets", "Return on Assets", "Returns",
              "Net Income / Total Assets x 100", _return_on_assets, "pct"),
    RatioSpec("debt_to_assets", "Debt to Asset Ratio", "Leverage",
              "Total Debt / Total Assets x 100", _debt_to_assets, "pct"),
    RatioSpec("debt_to_capital", "Debt to Capital Ratio", "Leverage",
              "Total Debt / (Total Debt + Shareholders' Equity) x 100", _debt_to_capital, "pct"),
    RatioSpec("interest_coverage", "Interest Coverage Ratio", "Coverage",
              "EBIT / Interest Expense", _interest_coverage, "x"),
    RatioSpec("dscr", "Debt Service Coverage Ratio", "Coverage",
              "EBITDA / (Finance Cost + Short-term Debt)", _dscr, "x"),
    RatioSpec("debt_to_ebitda", "Net Debt / EBITDA", "Coverage",
              "Net Debt (Total Debt - Cash) / EBITDA", _net_debt_to_ebitda, "x"),
    RatioSpec("altman_z", "Altman Z'-Score", "Bankruptcy",
              "0.717A + 0.847B + 3.107C + 0.420D + 0.998E", _altman_z_prime, "plain"),
]


# ── Band tables ───────────────────────────────────────────────
# Each band is (operator, limit, label, points), checked in order; the first match wins
# and the last band has operator None (everything else). display_only ratios score 0.
_V12 = {
    "quick_ratio"      : {"max": 2, "benchmark": "≥ 1x", "bands": [
        ("<", 1, "< 1x", -2), ("<=", 1.5, "1 - 1.5x", 1), (None, None, "> 1.5x", 2)]},
    "current_ratio"    : {"max": 0, "display_only": True, "benchmark": "≥ 1.5x", "bands": [
        ("<", 1.0, "< 1.0x", 0), ("<", 1.5, "1.0 - 1.5x", 0), (None, None, "≥ 1.5x", 0)]},
    "cash_ratio"       : {"max": 0, "display_only": True, "benchmark": "≥ 0.5x", "bands": [
        ("<", 0.2, "< 0.2x", 0), ("<", 0.5, "0.2 - 0.5x", 0), (None, None, "≥ 0.5x", 0)]},
    "net_income_margin": {"max": 4, "benchmark": "≥ 20%", "bands": [
        ("<", 10, "< 10%", 0), ("<=", 15, "10.1 - 15%", 2), ("<=", 20, "15.1 - 20%", 3), (None, None, "> 20%", 4)]},
    "revenue_growth"   : {"max": 5, "benchmark": "> 30%", "bands": [
        ("<", 0, "Negative", -3), ("<=", 5, "0 - 5%", 1), ("<=", 15, "6 - 15%", 2), ("<=", 30, "16 - 30%", 3),
        (None, None, "> 30%", 5)]},
    "return_on_assets" : {"max": 5, "benchmark": "≥ 15%", "bands": [
        ("<", 3, "< 3%", 0), ("<=", 6, "3 - 6%", 1), ("<=", 10, "6.1 - 10%", 2), ("<=", 15, "10.1 - 15%", 4),
        (None, None, "> 15%", 5)]},
    "debt_to_assets"   : {"max": 5, "benchmark": "< 30%", "bands": [
        ("<", 30, "< 30%", 5), ("<=", 50, "30 - 50%", 3), ("<=", 75, "50.1 - 75%", 2), ("<=", 100, "75.1 - 100%", 0),
        (None, None, "> 100%", 0)]},
    "debt_to_capital"  : {"max": 5, "benchmark": "< 30%", "bands": [
        ("<", 30, "< 30%", 5), ("<=", 50, "30 - 50%", 2), ("<=", 75, "50.1 - 75%", 1), ("<=", 100, "75.1 - 100%", 0),
        (None, None, "> 100%", 0)]},
    "interest_coverage": {"max": 6, "benchmark": "> 5.0x", "bands": [
        ("<", 1.0, "< 1.0x", -5), ("<=", 1.5, "1.0 - 1.5x", 2), ("<=", 3.0, "1.6 - 3.0x", 4), ("<=", 5.0, "3.1 - 5.0x", 5),
        (None, None, "> 5.0x", 6)]},
    "dscr"             : {"max": 7, "benchmark": ">= 1.5x", "bands": [
        (">=", 1.5, ">= 1.5x", 7), (">=", 1.25, "1.25 - 1.49x", 5), (">=", 1.0, "1.0 - 1.24x", 3), (None, None, "< 1.0x", 0)]},
    "debt_to_ebitda"   : {"max": 7, "benchmark": "< 2x", "bands": [
        ("<", 2, "< 2x", 7), ("<=", 3, "2.1 - 3.0x", 3), ("<=", 3.5, "3.1 - 3.5x", 2), ("<=", 4, "3.6 - 4.0x", 0),
        (None, None, "> 4.0x", 0)]},
    "altman_z"         : {"max": 10, "benchmark": "> 2.90", "bands": [
        ("<", 1.23, "< 1.23", -10), ("<=", 2.90, "1.23 - 2.90", 5), (None, None, "> 2.90", 10)]},
}

# v2.0 rebalance (spec P2b): Liquidity 2 -> 8, Coverage 20 -> 16, Bankruptcy 10 -> 8.
# Bands approved for release on 2026-10-27.
_V20 = {
    **_V12,
    "current_ratio" : {"max": 3, "benchmark": "≥ 1.5x", "bands": [
        ("<", 1.0, "< 1.0x", -2), ("<", 1.5, "1.0 - 1.5x", 1), (None, None, "≥ 1.5x", 3)]},
    "cash_ratio"    : {"max": 3, "benchmark": "≥ 0.5x", "bands": [
        ("<", 0.2, "< 0.2x", 0), ("<", 0.5, "0.2 - 0.5x", 1), (None, None, "≥ 0.5x", 3)]},
    "dscr"          : {"max": 5, "benchmark": ">= 1.5x", "bands": [
        (">=", 1.5, ">= 1.5x", 5), (">=", 1.25, "1.25 - 1.49x", 3), (">=", 1.0, "1.0 - 1.24x", 2), (None, None, "< 1.0x", 0)]},
    "debt_to_ebitda": {"max": 5, "benchmark": "< 2x", "bands": [
        ("<", 2, "< 2x", 5), ("<=", 3, "2.0 - 3.0x", 2), ("<=", 3.5, "3.1 - 3.5x", 1), (None, None, "> 3.5x", 0)]},
    "altman_z"      : {"max": 8, "benchmark": "> 2.90", "bands": [
        ("<", 1.23, "< 1.23", -8), ("<=", 2.90, "1.23 - 2.90", 4), (None, None, "> 2.90", 8)]},
}

MODELS = {"v1.2": _V12, "v2.0": _V20}


def max_score(version: str = MODEL_VERSION) -> int:
    return sum(t["max"] for t in MODELS[version].values() if not t.get("display_only"))


def cutoff_score(version: str = MODEL_VERSION) -> int:
    return math.ceil(max_score(version) * CUTOFF_PCT)


MAX_SCORE    = max_score()
CUTOFF_SCORE = cutoff_score()

for _v in MODELS:
    if max_score(_v) != 56:
        raise RuntimeError(f"Scoring model {_v} must total 56 points, got {max_score(_v)}")


_OPS = {"<": lambda v, x: v < x, "<=": lambda v, x: v <= x, ">=": lambda v, x: v >= x}


def _band(value: float, bands: list) -> tuple[str, int]:
    for op, limit, label, points in bands:
        if op is None or _OPS[op](value, limit):
            return label, points
    raise ValueError("band table has no catch-all band")


def _format(value: float, fmt: str) -> str:
    if fmt == "x":   return f"{value:.2f}x"
    if fmt == "pct": return f"{value:.1f}%"
    return f"{value:.2f}"


def _score(spec: RatioSpec, table: dict, f: dict) -> RatioResult:
    value, special = spec.measure(f)
    display_only   = bool(table.get("display_only"))
    if special:
        display_value, band, points = SPECIAL[special]
        points = table["max"] if points == "max" else points
    else:
        display_value = _format(value, spec.fmt)
        band, points  = _band(value, table["bands"])
    score = 0 if display_only else points
    return RatioResult(
        id=spec.id, name=spec.name, category=spec.category, formula=spec.formula,
        benchmark=table["benchmark"], max_score=table["max"],
        value=value, display_value=display_value, band=band, score=score,
        # A display-only ratio "passes" when it is above its weakest band
        passed=(not special and band != table["bands"][0][2]) if display_only else score > 0,
        display_only=display_only,
    )


# ── Public entry point ────────────────────────────────────────
def compute_all_ratios(figures: dict, version: str = MODEL_VERSION) -> dict:
    """
    Accepts raw figures dict, returns ratios list + totals.
    This is the single source of truth — never run scoring on the frontend.
    """
    model = MODELS[version]
    f     = normalise_rates(figures)

    ratios = []
    for spec in SPECS:
        try:
            ratios.append(_score(spec, model[spec.id], f))
        except Exception:
            # Never let one bad ratio crash the whole assessment, but leave a trace
            log.exception("Ratio %s failed", spec.id)
            ratios.append(RatioResult(
                id=spec.id, name=spec.name, category="Error",
                formula="", benchmark="", max_score=0,
                value=0, display_value="Error",
                band="Error", score=0, passed=False,
            ))

    total_score = sum(r.score for r in ratios if not r.display_only)
    cutoff      = cutoff_score(version)

    return {
        "ratios"       : [r.__dict__ for r in ratios],
        "total_score"  : total_score,
        "max_score"    : max_score(version),
        "cutoff"       : cutoff,
        "eligible"     : total_score >= cutoff,
        "model_version": version,
    }