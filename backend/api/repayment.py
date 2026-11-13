"""
Repayment check for a loan or facility (decision D053).

The facility's payments in its first 12 months are added to what the company already owes
in the year (finance cost plus short-term debt, the same debt service the DSCR uses), then
compared with its earnings. The guides are the full-marks benchmarks of the scoring model.
It is the main reading for a loan; the 56-point score is shown beside it as indicative.

Terms come from figures["terms"] (api/instruments.py LOAN_FIELDS): amount in naira, tenor and
moratorium in months, interest rate in % a year, repayment one of REPAYMENT_TYPES.
Pure functions; figures are in N'000 as everywhere else.
"""
import re

from api.scoring import _interest, _n, _total_debt, normalise_rates

VERSION = "r1.0"

REPAYMENT_TYPES = {
    "amortising":      "Equal instalments",
    "equal_principal": "Equal principal",
    "bullet":          "Bullet at maturity",
    "revolving":       "Revolving / overdraft",
}

# (guide text, within, near): reading is "Within guide" when within(v), "Near guide" when near(v)
GUIDES = {
    "dscr":          ("≥ 1.5x", lambda v: v >= 1.5, lambda v: v >= 1.0),
    "net_debt":      ("< 2.0x", lambda v: v < 2.0,  lambda v: v <= 3.5),
    "interest_cover": ("> 5.0x", lambda v: v > 5.0, lambda v: v >= 1.5),
}


def parse_number(value) -> float | None:
    """'5,000,000,000', '24%', '36 months', 'N5000000' -> a float; None when there is no number."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    m = re.search(r"-?\d+(?:\.\d+)?", str(value).replace(",", ""))
    return float(m.group()) if m else None


def normalise_repayment(value) -> str:
    v = str(value or "").strip().lower()
    if v in REPAYMENT_TYPES:
        return v
    if "bullet" in v or "maturity" in v:
        return "bullet"
    if "revolv" in v or "overdraft" in v:
        return "revolving"
    if "principal" in v:
        return "equal_principal"
    return "amortising"


def first_year_payments(amount: float, tenor: int, rate_pct: float, repayment: str, moratorium: int = 0) -> dict:
    """Principal and interest paid in months 1 to 12 (or to maturity if sooner), in the amount's unit."""
    r = rate_pct / 100 / 12
    tenor = max(int(tenor), 1)
    mora = min(max(int(moratorium or 0), 0), tenor - 1)
    balance, principal_paid, interest_paid = amount, 0.0, 0.0
    repay_months = tenor - mora
    if repayment == "amortising" and repay_months > 0:
        pmt = amount / repay_months if r == 0 else amount * r / (1 - (1 + r) ** -repay_months)
    for month in range(1, min(12, tenor) + 1):
        interest = balance * r
        if repayment == "revolving":
            principal = 0.0
        elif repayment == "bullet":
            principal = balance if month == tenor else 0.0
        elif month <= mora:
            principal = 0.0
        elif repayment == "equal_principal":
            principal = amount / repay_months
        else:  # amortising
            principal = pmt - interest
        principal = min(principal, balance)
        balance -= principal
        principal_paid += principal
        interest_paid += interest
    return {"principal": principal_paid, "interest": interest_paid, "total": principal_paid + interest_paid}


def _reading(key: str, value: float | None) -> str:
    if value is None:
        return "N/M"
    _, within, near = GUIDES[key]
    if within(value):
        return "Within guide"
    if near(value):
        return "Near guide"
    return "Above guide" if key == "net_debt" else "Below guide"


def _ratio(num: float, den: float) -> float | None:
    return num / den if den > 0 else None


def repayment_check(figures: dict) -> dict:
    """The check for figures of a loan assessment, or status 'insufficient' with what is missing."""
    f = normalise_rates(figures or {})
    terms = f.get("terms") or {}
    amount = parse_number(terms.get("amount"))
    tenor = parse_number(terms.get("tenor"))
    rate = parse_number(terms.get("interestRate"))
    missing = [label for label, v, ok in (("amount", amount, amount and amount > 0),
                                          ("tenor", tenor, tenor and tenor >= 1),
                                          ("interest rate", rate, rate is not None and rate >= 0)) if not ok]
    if missing:
        return {"version": VERSION, "status": "insufficient",
                "message": f"Enter the facility's {', '.join(missing)} on the facility request to run the repayment check."}
    repayment = normalise_repayment(terms.get("repayment"))
    moratorium = int(parse_number(terms.get("moratorium")) or 0)
    amount_k = amount / 1000  # naira -> N'000, the unit of the figures
    pay = first_year_payments(amount_k, int(tenor), rate, repayment, moratorium)

    ebitda, ebit = _n(f.get("ebitda")), _n(f.get("ebit"))
    interest_now = _interest(f)
    service_now = interest_now + _n(f.get("shortTermDebt"))
    service_with = service_now + pay["total"]
    net_debt_now = _total_debt(f) - _n(f.get("cash"))
    net_debt_with = net_debt_now + amount_k

    dscr_now, dscr_with = _ratio(ebitda, service_now), _ratio(ebitda, service_with)
    nd_now = net_debt_now / ebitda if ebitda > 0 else None
    nd_with = net_debt_with / ebitda if ebitda > 0 else None
    ic_now = _ratio(ebit, interest_now)
    ic_with = _ratio(ebit, interest_now + pay["interest"])

    measures = [
        {"id": "debt_service", "label": "Yearly debt service (N'000)", "today": round(service_now, 2),
         "withFacility": round(service_with, 2), "guide": None, "reading": None, "unit": "amount"},
        {"id": "dscr", "label": "Debt service cover (EBITDA ÷ debt service)", "today": dscr_now,
         "withFacility": dscr_with, "guide": GUIDES["dscr"][0], "reading": _reading("dscr", dscr_with), "unit": "x"},
        {"id": "net_debt", "label": "Net debt ÷ EBITDA", "today": nd_now, "withFacility": nd_with,
         "guide": GUIDES["net_debt"][0], "reading": _reading("net_debt", nd_with), "unit": "x"},
        {"id": "interest_cover", "label": "Interest cover (EBIT ÷ interest)", "today": ic_now, "withFacility": ic_with,
         "guide": GUIDES["interest_cover"][0], "reading": _reading("interest_cover", ic_with), "unit": "x"},
    ]
    readings = [m["reading"] for m in measures if m["reading"]]
    if all(r == "Within guide" for r in readings):
        overall = "Comfortable"
    elif any(r in ("Below guide", "Above guide", "N/M") for r in readings):
        overall = "Stretched"
    else:
        overall = "Tight"
    notes = []
    if ebitda <= 0:
        notes.append("EBITDA is zero or negative, so earnings do not cover any debt service.")
    if repayment == "revolving":
        notes.append("A revolving facility is taken as fully drawn, paying interest only; the principal is assumed to be renewed.")
    if repayment == "bullet" and tenor > 12:
        notes.append("The principal falls due at maturity, after the first 12 months, so it is not in this year's debt service.")
    if tenor <= 12:
        notes.append("The facility is repaid within 12 months, so all of its principal is in this year's debt service.")
    if moratorium:
        notes.append(f"Interest only during the {moratorium}-month moratorium.")
    return {
        "version": VERSION, "status": "ok",
        "facility": {"amount": amount, "tenorMonths": int(tenor), "ratePct": rate, "repayment": repayment,
                     "repaymentLabel": REPAYMENT_TYPES[repayment], "moratoriumMonths": moratorium,
                     "facilityType": terms.get("facilityType"), "collateral": terms.get("collateral")},
        "firstYear": {k: round(v, 2) for k, v in pay.items()},
        "cover": dscr_with,
        "overall": overall,
        "measures": measures,
        "notes": notes,
    }


def summary_lines(check: dict | None) -> str:
    """Lines for the narrative prompt."""
    if not check or check.get("status") != "ok":
        return ""
    fac, fy = check["facility"], check["firstYear"]
    out = [f"\nREPAYMENT CHECK, overall {check['overall']} (facility of N{fac['amount']:,.0f}, {fac['tenorMonths']} months, {fac['ratePct']}% a year, "
           f"{fac['repaymentLabel'].lower()}):",
           f"  Facility payments in the first 12 months: N{fy['total'] * 1000:,.0f} "
           f"(principal N{fy['principal'] * 1000:,.0f}, interest N{fy['interest'] * 1000:,.0f})"]
    for m in check["measures"]:
        if m["unit"] == "x":
            fmt = lambda v: "N/M" if v is None else f"{v:.2f}x"  # noqa: E731
            out.append(f"  {m['label']}: today {fmt(m['today'])}, with facility {fmt(m['withFacility'])} "
                       f"(guide {m['guide']}: {m['reading']})")
    for n in check["notes"]:
        out.append(f"  Note: {n}")
    return "\n".join(out) + "\n"
