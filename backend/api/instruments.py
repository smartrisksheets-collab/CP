"""
What is being assessed (decision D052): commercial paper, a corporate bond or note, a loan
or facility, or a general review of a company with no instrument.

Off by default per tenant (tenants.instrument_mode off | on). With it off every assessment
is commercial paper, exactly as before. The scoring model is the same for every instrument;
it was calibrated on CP issuers, so reports for other instruments say so.
"""

MODES = ("off", "on")

# code: (picker label, report title, default instrument type line)
INSTRUMENTS = {
    "cp":     ("Commercial paper",      "Commercial Paper Assessment",   "Senior Unsecured Commercial Paper"),
    "bond":   ("Corporate bond / note", "Corporate Bond Assessment",     "Corporate Bond / Note"),
    "loan":   ("Loan or facility",      "Loan Assessment",               "Loan / Facility"),
    "review": ("General review",        "Corporate Credit Review",       "No instrument: financial health review"),
}
DEFAULT = "cp"

# Fields of figures["terms"] for a bond or a loan, in display order: (key, label)
BOND_FIELDS = (
    ("issuer", "Issuer"), ("programmeSize", "Programme size"), ("issueSize", "Issue size"),
    ("series", "Series / tranche"), ("coupon", "Coupon"), ("couponFrequency", "Coupon frequency"),
    ("tenor", "Tenor"), ("issueDate", "Issue date"), ("maturityDate", "Maturity date"),
    ("security", "Security / ranking"), ("guarantee", "Guarantee or credit enhancement"),
    ("redemption", "Redemption"), ("callOption", "Call option"), ("issueRating", "Issue rating"),
    ("trustee", "Trustee"), ("useOfProceeds", "Use of proceeds"),
)
LOAN_FIELDS = (
    ("facilityType", "Facility type"), ("amount", "Amount"), ("tenor", "Tenor"),
    ("interestRate", "Interest rate / pricing"), ("repayment", "Repayment"),
    ("moratorium", "Moratorium"), ("collateral", "Collateral / security"),
    ("guarantee", "Guarantee"), ("purpose", "Purpose"), ("covenants", "Key covenants"),
)
TERM_FIELDS = {"bond": BOND_FIELDS, "loan": LOAN_FIELDS}


def normalise_instrument(value) -> str | None:
    code = str(value or "").strip().lower()
    return code if code in INSTRUMENTS else None


def instrument_of(figures: dict) -> str:
    return normalise_instrument((figures or {}).get("instrument")) or DEFAULT


def report_title(code: str) -> str:
    return INSTRUMENTS.get(code, INSTRUMENTS[DEFAULT])[1]


def instrument_line(code: str, terms: dict | None) -> str:
    """The header's instrument line: the security or facility type when given, else the default."""
    terms = terms or {}
    if code == "bond" and terms.get("security"):
        return f"{terms['security']} corporate bond / note"
    if code == "loan" and terms.get("facilityType"):
        return str(terms["facilityType"])
    return INSTRUMENTS.get(code, INSTRUMENTS[DEFAULT])[2]


def clean_terms(code: str, terms: dict | None) -> dict | None:
    """Keep the known fields for the instrument as trimmed strings; None when nothing is filled."""
    fields = TERM_FIELDS.get(code)
    if not fields or not isinstance(terms, dict):
        return None
    out = {}
    for key, _ in fields:
        v = terms.get(key)
        v = " ".join(str(v).split())[:300] if v not in (None, "") else None
        out[key] = v
    return out if any(out.values()) else None


def narrative_block(figures: dict) -> str:
    """Lines for the narrative prompt describing what is being assessed."""
    code = instrument_of(figures)
    if code == "cp":
        return ""
    label = INSTRUMENTS[code][0]
    lines = [f"\nINSTRUMENT BEING ASSESSED: {label}"]
    terms = (figures or {}).get("terms") or {}
    for key, name in TERM_FIELDS.get(code, ()):
        if terms.get(key):
            lines.append(f"  {name}: {terms[key]}")
    if code == "review":
        lines.append("  There is no instrument: assess the company's general creditworthiness and financial health.")
    return "\n".join(lines) + "\n"


INSTRUMENT_RULES = {
    "bond": "- This is a corporate bond or note, not commercial paper. Judge repayment over the bond's full tenor:"
            " weigh leverage, coverage and the multi-year trend more than near-term liquidity. Never call it commercial paper.\n",
    "loan": "- This is a loan or facility, not commercial paper. Judge whether the company can service and repay this"
            " facility over its tenor, citing the amount and tenor when given. Never call it commercial paper.\n",
    "review": "- There is no instrument. Write about the company's general creditworthiness and financial health."
              " Never mention commercial paper, an issuance or investment in an instrument.\n",
}
