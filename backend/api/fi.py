"""
Issuer sector and financial-institution (FI) ratios (spec: Client Scoring Policies &
Sector Benchmarks, phase 1 with FI ratios; decision D050).

Banks, finance companies, microfinance banks, leasing companies and lending fintechs
do not split assets into current and non-current, so the corporate ratios fit them
poorly. For an issuer tagged "financial_services" this module works out the SmartRisk
FI ratios from figures["fi"] (plus total assets, equity and net income from the main
extraction). They are indicative only: nothing here changes the SmartRisk score.

Pure functions; api/benchmarks.py adds peer medians, api/routes/assessment.py calls both.
"""

VERSION = "fi-0.1"
MODES   = ("off", "shadow")

# (code, label). The label is what the analyst picks on the Upload step.
SECTORS = (
    ("financial_services", "Financial services (bank, finance company, MFB, leasing, lending fintech)"),
    ("fintech_payments",   "Fintech: payments, no loan book"),
    ("manufacturing",      "Manufacturing"),
    ("consumer_goods",     "Consumer goods"),
    ("oil_gas",            "Oil and gas"),
    ("telecom",            "Telecoms"),
    ("aviation",           "Aviation"),
    ("healthcare",         "Healthcare"),
    ("agriculture",        "Agriculture"),
    ("real_estate",        "Real estate and construction"),
    ("other",              "Other"),
)
SECTOR_CODES = {code for code, _ in SECTORS}
FI_SECTORS   = {"financial_services"}

# Figures read from the statements of a financial issuer, all in N'000 except the two
# ratios the issuer reports itself (percentages). Prior-year values give averages.
FI_FIELDS = (
    "grossLoans", "priorGrossLoans", "stage3Loans", "stage3Allowance", "impairmentCharge",
    "interestIncome", "interestExpense", "operatingIncome", "operatingExpenses",
    "interestEarningAssets", "priorInterestEarningAssets",
    "liquidAssets", "customerDeposits", "borrowingsDue12m", "totalBorrowings",
    "capitalAdequacyRatio", "reportedLiquidityRatio",
)


def normalise_sector(value) -> str | None:
    code = str(value or "").strip().lower()
    return code if code in SECTOR_CODES else None


def is_fi(figures: dict) -> bool:
    return normalise_sector((figures or {}).get("sector")) in FI_SECTORS


def _num(v):
    if v is None or v == "":
        return None
    try:
        return float(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return None


def _avg(current, prior):
    """Average of two balances; the year-end balance alone when the prior year is missing."""
    if current is None:
        return None, False
    if prior is None:
        return current, False
    return (current + prior) / 2, True


def _pct(v: float) -> str:
    return f"{v:.1f}%"


# (id, name, category, formula). Order is the order shown.
FI_SPECS = (
    ("liquid_to_st_funding",     "Liquid assets to short-term funding", "Liquidity",
     "(Cash + placements + T-bills) / (customer deposits + borrowings due within 12 months)"),
    ("st_funding_concentration", "Short-term funding concentration",    "Funding",
     "Borrowings due within 12 months / total borrowings"),
    ("npl_ratio",                "Stage 3 (NPL) ratio",                 "Asset quality",
     "Stage 3 loans / gross loans"),
    ("stage3_coverage",          "Stage 3 coverage",                    "Asset quality",
     "Stage 3 impairment allowance / Stage 3 loans"),
    ("cost_of_risk",             "Cost of risk",                        "Asset quality",
     "Impairment charge on loans / average gross loans"),
    ("equity_to_assets",         "Equity to total assets",              "Capital",
     "Shareholders' equity / total assets"),
    ("car",                      "Capital adequacy ratio",              "Capital",
     "As reported by the issuer (banks)"),
    ("roaa",                     "Return on average assets",            "Profitability",
     "Net income / average total assets"),
    ("nim",                      "Net interest margin",                 "Profitability",
     "(Interest income − interest expense) / average interest-earning assets"),
    ("cost_to_income",           "Cost-to-income",                      "Efficiency",
     "Operating expenses / operating income"),
    ("reported_liquidity",       "Regulatory liquidity ratio",          "Liquidity",
     "As reported by the issuer (banks)"),
)


def _measure(rid: str, f: dict, base: dict):
    """(value in %, display or None, note or None). A None value with no display is N/A."""
    g = lambda k: _num(f.get(k))  # noqa: E731
    if rid == "liquid_to_st_funding":
        liquid = g("liquidAssets")
        dep, due = g("customerDeposits"), g("borrowingsDue12m")
        if liquid is None or (dep is None and due is None):
            return None, None, None
        denom = (dep or 0) + (due or 0)
        if denom <= 0:
            return None, "No short-term funding", None
        return liquid / denom * 100, None, None
    if rid == "st_funding_concentration":
        due, total = g("borrowingsDue12m"), g("totalBorrowings")
        if total is None:
            return None, None, None
        if total <= 0:
            return None, "No borrowings", None
        if due is None:
            return None, None, None
        return due / total * 100, None, None
    if rid == "npl_ratio":
        s3, gross = g("stage3Loans"), g("grossLoans")
        if s3 is None or not gross:
            return None, None, None
        return s3 / gross * 100, None, None
    if rid == "stage3_coverage":
        allowance, s3 = g("stage3Allowance"), g("stage3Loans")
        if allowance is None or s3 is None:
            return None, None, None
        if s3 <= 0:
            return None, "No Stage 3 loans", None
        return allowance / s3 * 100, None, None
    if rid == "cost_of_risk":
        charge = g("impairmentCharge")
        avg, both = _avg(g("grossLoans"), g("priorGrossLoans"))
        if charge is None or not avg:
            return None, None, None
        return charge / avg * 100, None, (None if both else "Year-end loans used: no prior year")
    if rid == "equity_to_assets":
        eq, ta = _num(base.get("shareholdersEquity")), _num(base.get("totalAssets"))
        if eq is None or not ta:
            return None, None, None
        return eq / ta * 100, None, None
    if rid == "car":
        v = g("capitalAdequacyRatio")
        return (v, None, None) if v is not None else (None, "Not reported", None)
    if rid == "roaa":
        ni = _num(base.get("netIncome"))
        avg, both = _avg(_num(base.get("totalAssets")), _num(base.get("priorYearTotalAssets")))
        if ni is None or not avg:
            return None, None, None
        return ni / avg * 100, None, (None if both else "Year-end assets used: no prior year")
    if rid == "nim":
        ii, ie = g("interestIncome"), g("interestExpense")
        avg, both = _avg(g("interestEarningAssets"), g("priorInterestEarningAssets"))
        if ii is None or ie is None or not avg:
            return None, None, None
        return (ii - abs(ie)) / avg * 100, None, (None if both else "Year-end assets used: no prior year")
    if rid == "cost_to_income":
        opex, inc = g("operatingExpenses"), g("operatingIncome")
        if opex is None or inc is None:
            return None, None, None
        if inc <= 0:
            return None, "N/M", "Operating income is zero or negative"
        return abs(opex) / inc * 100, None, None
    if rid == "reported_liquidity":
        v = g("reportedLiquidityRatio")
        return (v, None, None) if v is not None else (None, "Not reported", None)
    raise KeyError(rid)


def compute_fi(figures: dict) -> dict | None:
    """
    FI ratios for a financial issuer, or None when the issuer is not tagged financial_services.
    status "no_data" when no FI figure was extracted or entered.
    """
    figures = figures or {}
    if not is_fi(figures):
        return None
    f = figures.get("fi") or {}
    if not any(_num(f.get(k)) is not None for k in FI_FIELDS):
        return {
            "version": VERSION, "sector": "financial_services", "status": "no_data", "ratios": [],
            "message": "No financial-institution figures yet. Enter them on the Review Data step to see the FI ratios.",
        }
    ratios = []
    for rid, name, category, formula in FI_SPECS:
        value, display, note = _measure(rid, f, figures)
        ratios.append({
            "id": rid, "name": name, "category": category, "formula": formula,
            "value": round(value, 4) if value is not None else None,
            "display": _pct(value) if value is not None else (display or "N/A"),
            "note": note, "peer": None,
        })
    return {"version": VERSION, "sector": "financial_services", "status": "ok", "ratios": ratios,
            "available": sum(r["value"] is not None for r in ratios)}


def fi_input_error(figures: dict) -> str | None:
    """Review-step checks: reported ratios are percentages and balances are not negative."""
    f = (figures or {}).get("fi") or {}
    for key, label in (("capitalAdequacyRatio", "Capital adequacy ratio"),
                       ("reportedLiquidityRatio", "Regulatory liquidity ratio")):
        v = _num(f.get(key))
        if v is not None and not 0 <= v <= 100:
            return f"{label} must be a percentage between 0 and 100."
    for key in ("grossLoans", "priorGrossLoans", "stage3Loans", "stage3Allowance", "liquidAssets",
                "customerDeposits", "borrowingsDue12m", "totalBorrowings",
                "interestEarningAssets", "priorInterestEarningAssets"):
        v = _num(f.get(key))
        if v is not None and v < 0:
            return "Financial-institution balances cannot be negative."
    s3, gross = _num(f.get("stage3Loans")), _num(f.get("grossLoans"))
    if s3 is not None and gross is not None and s3 > gross:
        return "Stage 3 loans cannot be more than gross loans."
    due, total = _num(f.get("borrowingsDue12m")), _num(f.get("totalBorrowings"))
    if due is not None and total is not None and due > total:
        return "Borrowings due within 12 months cannot be more than total borrowings."
    return None
