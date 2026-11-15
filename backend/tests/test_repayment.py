import pytest

from api.repayment import first_year_payments, normalise_repayment, parse_number, repayment_check, summary_lines

BASE = {"ebitda": 4000, "ebit": 3000, "financeCost": 500, "shortTermDebt": 1000, "longTermDebt": 3000,
        "cash": 1000, "rateUnit": "percent"}


def fig(**terms):
    t = {"amount": "1,200,000", "tenor": "12", "interestRate": "0", "repayment": "amortising"}
    t.update(terms)
    return {**BASE, "terms": t}


def test_parse_number():
    assert parse_number("5,000,000") == 5000000
    assert parse_number("24%") == 24
    assert parse_number("36 months") == 36
    assert parse_number("") is None and parse_number(None) is None


def test_normalise_repayment():
    assert normalise_repayment("Bullet at maturity") == "bullet"
    assert normalise_repayment("overdraft") == "revolving"
    assert normalise_repayment("equal_principal") == "equal_principal"
    assert normalise_repayment(None) == "amortising"


def test_zero_rate_amortising_repays_in_full():
    p = first_year_payments(1200, 12, 0, "amortising")
    assert p["principal"] == pytest.approx(1200) and p["interest"] == 0


def test_annuity_first_year():
    # 1,000 over 24 months at 12%: payment 47.07; year-1 total = 12 payments
    p = first_year_payments(1000, 24, 12, "amortising")
    assert p["total"] == pytest.approx(47.0735 * 12, rel=1e-3)
    assert p["principal"] < 1000


def test_bullet_beyond_a_year_pays_interest_only():
    p = first_year_payments(1000, 36, 12, "bullet")
    assert p["principal"] == 0 and p["interest"] == pytest.approx(120)


def test_moratorium_interest_only():
    p = first_year_payments(1200, 24, 0, "equal_principal", moratorium=6)
    assert p["principal"] == pytest.approx(1200 / 18 * 6)


def test_revolving_note():
    c = repayment_check(fig(repayment="revolving", interestRate="10"))
    assert c["firstYear"]["principal"] == 0
    assert any("revolving" in n for n in c["notes"])


def test_check_measures():
    c = repayment_check(fig())  # N1.2m = N'000 1,200, all repaid in year 1
    assert c["status"] == "ok"
    m = {x["id"]: x for x in c["measures"]}
    assert m["debt_service"]["today"] == 1500 and m["debt_service"]["withFacility"] == pytest.approx(2700)
    assert m["dscr"]["today"] == pytest.approx(4000 / 1500)
    assert m["dscr"]["withFacility"] == pytest.approx(4000 / 2700)
    assert m["dscr"]["reading"] == "Near guide"
    assert m["net_debt"]["withFacility"] == pytest.approx((4000 + 1200 - 1000) / 4000)
    assert m["interest_cover"]["withFacility"] == pytest.approx(6.0)
    assert c["overall"] == "Tight"


def test_insufficient():
    c = repayment_check({**BASE, "terms": {"amount": "5000000"}})
    assert c["status"] == "insufficient"
    assert "tenor" in c["message"] and "interest rate" in c["message"]
    assert repayment_check(BASE)["status"] == "insufficient"


def test_negative_ebitda():
    c = repayment_check({**fig(), "ebitda": -10})
    m = {x["id"]: x for x in c["measures"]}
    assert m["net_debt"]["withFacility"] is None and m["net_debt"]["reading"] == "N/M"
    assert c["overall"] == "Stretched"


def test_summary_lines():
    assert summary_lines(None) == ""
    s = summary_lines(repayment_check(fig()))
    assert "REPAYMENT CHECK" in s and "Debt service cover" in s


def test_interest_check_flags_low_reported_interest():
    # Streadvest FY2025 (N'000): interest 85,000 against loans of 694,640 at 25% and 764,104 at 27.5%
    f = {"ebitda": 5145000, "ebit": 5110760, "financeCost": 85000, "shortTermDebt": 694640,
         "longTermDebt": 764104, "cash": 2200000, "shortTermInterestRate": 25, "longTermInterestRate": 27.5,
         "rateUnit": "percent",
         "terms": {"amount": "₦5,776,666", "tenor": "24 months", "interestRate": "28% a year", "repayment": "Equal instalments"}}
    c = repayment_check(f)
    ic = c["interestCheck"]
    assert ic["flag"] == "low" and ic["implied"] == pytest.approx(383789, rel=1e-3)
    assert ic["coverAtRates"] == pytest.approx(5145000 / (383789.1 + 694640 + c["firstYear"]["total"]), rel=1e-3)
    assert c["notes"][0].startswith("Check the interest") and "N85,000,000" in c["notes"][0]
    assert c["overall"] == "Comfortable"  # the reading stays on the audited figure


def test_interest_check_quiet_when_consistent_or_missing():
    base = {"ebitda": 4000, "ebit": 3000, "shortTermDebt": 1000, "longTermDebt": 0,
            "shortTermInterestRate": 20, "rateUnit": "percent",
            "terms": {"amount": "1000000", "tenor": "12", "interestRate": "20"}}
    assert repayment_check({**base, "financeCost": 180})["interestCheck"]["flag"] is None
    assert repayment_check({**base, "financeCost": 500})["interestCheck"]["flag"] == "high"
    assert repayment_check(base)["interestCheck"] is None  # no reported interest: the rates are used
    assert repayment_check({**base, "financeCost": 180, "shortTermInterestRate": None})["interestCheck"] is None


def test_foreign_currency_note():
    c = repayment_check(fig(currency="USD 1,000 at ₦1,200 per USD"))
    assert any("Foreign-currency facility (USD 1,000" in n for n in c["notes"])
    assert not any("Foreign-currency" in n for n in repayment_check(fig(currency="Naira"))["notes"])
