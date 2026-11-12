import pytest

from api.history import (
    analyse, merge_periods, needs_comment, normalise_rc, parse_period_end, periods_to_store,
)

# A weakening issuer (N'000): margin and cover fall, debt outgrows EBITDA, acid-test improves
FY25 = {"revenue": 47_000_000, "netIncome": 3_337_000, "ebit": 5_694_000, "depreciationAndAmortisation": 1_450_000,
        "ebitda": 7_144_000, "financeCost": 2_190_000, "cash": 3_000_000, "inventory": 2_000_000,
        "prepaidExpenses": 0, "currentAssets": 14_000_000, "currentLiabilities": 11_000_000,
        "totalAssets": 60_000_000, "totalLiabilities": 35_000_000, "shortTermDebt": 8_000_000,
        "longTermDebt": 12_717_600, "shareholdersEquity": 25_000_000, "retainedEarnings": 12_000_000,
        "reportingPeriod": "31 December 2025"}
FY24 = {"revenue": 44_500_000, "netIncome": 3_738_000, "ebit": 6_170_500, "depreciationAndAmortisation": 1_350_000,
        "financeCost": 2_203_750, "cash": 2_800_000, "inventory": 2_000_000, "prepaidExpenses": 0,
        "currentAssets": 12_500_000, "currentLiabilities": 10_500_000, "totalAssets": 56_000_000,
        "totalLiabilities": 32_000_000, "shortTermDebt": 7_000_000, "longTermDebt": 11_049_200,
        "shareholdersEquity": 24_000_000, "retainedEarnings": 11_000_000, "operatingCashFlow": 4_850_000}
FY23 = {"revenue": 40_000_000, "netIncome": 3_840_000, "ebit": 6_160_000, "depreciationAndAmortisation": 1_200_000,
        "financeCost": 1_987_100, "cash": 2_500_000, "inventory": 2_000_000, "prepaidExpenses": 0,
        "currentAssets": 11_500_000, "currentLiabilities": 10_000_000, "totalAssets": 52_000_000,
        "totalLiabilities": 30_000_000, "shortTermDebt": 6_000_000, "longTermDebt": 9_456_000,
        "shareholdersEquity": 22_000_000, "retainedEarnings": 10_000_000, "operatingCashFlow": 5_100_000}


def _p(end, figs, source="upload", months=12, audited=True, doc=None, **kw):
    return {"periodEnd": end, "periodMonths": months, "audited": audited, "basis": "company",
            "figures": figs, "source": source, "docPeriodEnd": doc or end, **kw}


def _figures(periods, **hist):
    return {**FY25, "history": {"periods": periods, "fy0OperatingCashFlow": 4_600_000, **hist}}


THREE_YEARS = [_p("2024-12-31", FY24, "comparative", doc="2025-12-31"), _p("2023-12-31", FY23, doc="2024-12-31")]


def test_no_history_key_returns_none():
    assert analyse(dict(FY25)) is None


@pytest.mark.parametrize("raw,iso", [
    ("31 December 2025", "2025-12-31"), ("December 31, 2025", "2025-12-31"), ("31st Dec 2025", "2025-12-31"),
    ("31/12/2025", "2025-12-31"), ("2025-12-31", "2025-12-31"), ("30 June 2026", "2026-06-30"),
    ("year ended 31 March 2024", "2024-03-31"), ("", None), (None, None), ("FY2025", None), ("31 Foo 2025", None),
])
def test_parse_period_end(raw, iso):
    assert parse_period_end(raw) == iso


@pytest.mark.parametrize("raw,rc", [("RC 123456", "123456"), ("rc-0123456", "123456"), ("123 456", "123456"),
                                    ("", None), (None, None), ("RC", None), ("0000", None)])
def test_normalise_rc(raw, rc):
    assert normalise_rc(raw) == rc


def test_three_audited_years_weakening():
    h = analyse(_figures(THREE_YEARS))
    assert h["status"] == "ok" and h["yearsAvailable"] == 3
    assert [y["label"] for y in h["years"]] == ["FY2023", "FY2024", "FY2025"]
    assert h["confidence"] == "full" and h["factor"] == 1.0
    d = {x["id"]: x["direction"] for x in h["direction"]}
    assert d == {"net_income_margin": "weakening", "interest_coverage": "weakening",
                 "debt_to_ebitda": "weakening", "quick_ratio": "improving"}
    assert h["components"]["direction"] == -1.0
    assert h["stability"]["points"] == 1.0          # EBITDA margin moved gradually
    assert [f["id"] for f in h["redFlags"]] == ["debt_outgrew_ebitda"]
    assert h["adjustment"] == -1.0 and h["applied"] is False
    assert h["overall"] == "Weakening"
    assert h["interim"]["status"] == "none"


def test_current_statement_wins_its_own_year_and_restatement_is_noted():
    restated = {**FY25, "revenue": 48_500_000}
    h = analyse(_figures([*THREE_YEARS, _p("2025-12-31", restated, "stored", doc="2026-12-31")]))
    assert h["years"][-1]["source"] == "current"
    assert any(n["type"] == "restatement" and n["period"] == "FY2025" for n in h["notes"])


def test_newer_comparative_beats_original_statement():
    original = {**FY24, "revenue": 46_900_000}  # 5% higher than the restated figure
    merged, notes = merge_periods([
        _p("2024-12-31", original, "upload", doc="2024-12-31"),
        _p("2024-12-31", FY24, "comparative", doc="2025-12-31"),
    ])
    assert merged[0]["figures"]["revenue"] == 44_500_000
    assert notes[0]["differences"][0]["field"] == "revenue"


def test_audited_beats_unaudited_for_same_period():
    merged, _ = merge_periods([
        _p("2024-12-31", {**FY24, "revenue": 1}, "upload", audited=False, doc="2025-01-31"),
        _p("2024-12-31", FY24, "stored", audited=True),
    ])
    assert merged[0]["audited"] is True


def test_two_years_is_partial_half_weight():
    h = analyse(_figures([_p("2024-12-31", FY24, "comparative", doc="2025-12-31")]))
    assert h["yearsAvailable"] == 2 and h["confidence"] == "partial" and h["factor"] == 0.5
    assert h["adjustment"] == round(h["subtotal"] * 0.5, 1)


def test_one_year_is_limited_no_adjustment():
    h = analyse(_figures([]))
    assert h["confidence"] == "limited" and h["adjustment"] == 0.0 and h["redFlags"] == []
    assert h["overall"] == "Not enough history"


def test_unaudited_year_makes_partial():
    periods = [THREE_YEARS[0], _p("2023-12-31", FY23, audited=False)]
    h = analyse(_figures(periods))
    assert h["confidence"] == "partial"
    assert any("not audited" in r for r in h["confidenceReasons"])


def test_unknown_year_end_asks_for_it():
    figs = {**_figures(THREE_YEARS), "reportingPeriod": "FY2025"}
    assert analyse(figs)["status"] == "no_period_end"
    figs["history"]["fy0PeriodEnd"] = "2025-12-31"
    assert analyse(figs)["status"] == "ok"


def test_year_end_change_is_flagged_partial():
    # Year end moved from September to December: FY2024 covers 15 months
    periods = [_p("2024-09-30", FY24), _p("2023-09-30", FY23)]
    h = analyse(_figures(periods))
    assert h["yearsAvailable"] == 3 and h["confidence"] == "partial"
    assert any(n["type"] == "irregular_period" for n in h["notes"])


def test_gap_year_not_bridged():
    # FY2024 missing: FY2022 is too far back to stand in for it
    h = analyse(_figures([_p("2022-12-31", FY23)]))
    assert h["yearsAvailable"] == 1


def test_loss_negative_cash_flow_and_distress_flags():
    bad23 = {**FY23, "netIncome": -500_000, "operatingCashFlow": -100_000, "retainedEarnings": -20_000_000,
             "ebit": 100_000, "currentAssets": 3_000_000}
    h = analyse({**_figures([THREE_YEARS[0], _p("2023-12-31", bad23)]), "netIncome": FY25["netIncome"]})
    ids = {f["id"] for f in h["redFlags"]}
    assert {"loss_year", "altman_distress"} <= ids
    assert h["components"]["redFlags"] == -len(h["redFlags"])


def test_latest_negative_cash_flow_alone_is_a_flag():
    h = analyse(_figures(THREE_YEARS, fy0OperatingCashFlow=-1))
    assert any(f["id"] == "negative_ocf" for f in h["redFlags"])


def test_adjustment_is_clamped():
    awful = {**FY25, "netIncome": -9_000_000, "ebit": -1_000_000, "depreciationAndAmortisation": 0, "ebitda": -1_000_000,
             "retainedEarnings": -30_000_000, "currentAssets": 5_000_000}
    figs = {**awful, "history": {"periods": THREE_YEARS, "fy0OperatingCashFlow": -2_000_000}}
    h = analyse(figs)
    assert h["subtotal"] == -5.0 and h["adjustment"] == -5.0


def test_improving_issuer_capped_at_plus_three():
    # Older years weaker than FY2025 on every trend ratio, steady margins
    weak24 = {**FY24, "netIncome": 2_000_000, "financeCost": 4_000_000, "longTermDebt": 20_000_000,
              "currentAssets": 9_000_000}
    weak23 = {**FY23, "netIncome": 1_500_000, "financeCost": 4_500_000, "longTermDebt": 22_000_000,
              "currentAssets": 8_000_000}
    h = analyse(_figures([_p("2024-12-31", weak24), _p("2023-12-31", weak23)]))
    assert all(d["direction"] == "improving" for d in h["direction"])
    assert h["subtotal"] <= 3.0 and h["adjustment"] == h["subtotal"]


def test_one_off_removed_from_trend_only():
    one_off = {"amount": 620_000, "reason": "Gain on disposal of property"}
    with_oo = analyse(_figures([{**THREE_YEARS[0], "oneOff": one_off}, THREE_YEARS[1]]))
    without = analyse(_figures(THREE_YEARS))
    a = with_oo["years"][1]["ratios"]["net_income_margin"]["value"]
    b = without["years"][1]["ratios"]["net_income_margin"]["value"]
    assert a < b and with_oo["years"][1]["oneOff"] == one_off


def test_no_debt_issuer_interest_cover_stable():
    nodebt = {"financeCost": 0, "shortTermDebt": 0, "longTermDebt": 0}
    figs = {**FY25, **nodebt, "history": {"periods": [
        _p("2024-12-31", {**FY24, **nodebt}), _p("2023-12-31", {**FY23, **nodebt})], "fy0OperatingCashFlow": 1}}
    d = {x["id"]: x for x in analyse(figs)["direction"]}
    assert d["interest_coverage"]["direction"] == "stable"


def test_negative_ebitda_appearing_is_weakening():
    figs = {**FY25, "ebit": -3_000_000, "ebitda": -1_550_000, "history": {"periods": THREE_YEARS}}
    d = {x["id"]: x for x in analyse(figs)["direction"]}
    assert d["debt_to_ebitda"]["direction"] == "weakening"


# ── Interim early warning ─────────────────────────────────────
H1_25 = {"revenue": 22_600_000, "netIncome": 2_011_400, "ebit": 2_825_600, "depreciationAndAmortisation": 700_000,
         "financeCost": 1_046_500, "cash": 2_900_000, "inventory": 2_000_000, "prepaidExpenses": 0,
         "currentAssets": 13_340_000, "currentLiabilities": 10_800_000, "totalAssets": 58_000_000,
         "shortTermDebt": 7_500_000, "longTermDebt": 12_300_000, "shareholdersEquity": 24_500_000,
         "operatingCashFlow": 2_100_000}
H1_26 = {**H1_25, "revenue": 23_100_000, "netIncome": 1_478_400, "ebit": 2_266_100, "financeCost": 1_079_100,
         "currentAssets": 13_484_000, "currentLiabilities": 11_600_000, "operatingCashFlow": 1_350_000}


def _interim(cur=H1_26, prior=H1_25, cur_end="2026-06-30"):
    out = [_p(cur_end, cur, "upload", months=6, audited=False, doc=cur_end)]
    if prior is not None:
        out.append(_p("2025-06-30", prior, "comparative", months=6, audited=False, doc=cur_end))
    return out


def test_interim_two_of_four_triggered():
    h = analyse(_figures([*THREE_YEARS, *_interim()]))
    w = h["interim"]
    assert w["status"] == "ok" and w["current"] == "H1 2026" and w["prior"] == "H1 2025"
    res = {c["id"]: c["triggered"] for c in w["checks"]}
    assert res == {"margin": True, "cover": True, "acid": False, "ocf": False}
    assert w["triggered"] == 2 and w["available"] == 4
    # Interim never touches the 3-year trend or the adjustment
    assert h["adjustment"] == analyse(_figures(THREE_YEARS))["adjustment"]
    assert needs_comment(h) is True
    assert needs_comment(analyse(_figures([*THREE_YEARS, *_interim()], analystComment="Seasonal"))) is False


def test_interim_without_comparative():
    w = analyse(_figures([*THREE_YEARS, *_interim(prior=None)]))["interim"]
    assert w["status"] == "no_comparative"


def test_stale_interim_ignored():
    w = analyse(_figures([*THREE_YEARS, *_interim(cur_end="2025-06-30", prior=None)]))["interim"]
    assert w["status"] == "stale"


def test_interim_missing_cash_flow_is_not_available():
    cur = {k: v for k, v in H1_26.items() if k != "operatingCashFlow"}
    w = analyse(_figures([*THREE_YEARS, *_interim(cur=cur)]))["interim"]
    ocf = next(c for c in w["checks"] if c["id"] == "ocf")
    assert ocf["triggered"] is None and w["available"] == 3


def test_periods_to_store_includes_current_year():
    stored = periods_to_store(_figures(THREE_YEARS))
    assert [p["periodEnd"] for p in stored] == ["2025-12-31", "2024-12-31", "2023-12-31"]
    assert stored[0]["figures"]["operatingCashFlow"] == 4_600_000


def test_garbage_periods_are_skipped():
    h = analyse(_figures([{"periodEnd": "nonsense", "figures": FY24}, {"periodEnd": "2024-12-31", "figures": {}},
                          {"periodEnd": "2024-12-31", "figures": {"revenue": "abc", "totalAssets": None}}]))
    assert h["yearsAvailable"] == 1


def test_interim_prior_half_without_balance_sheet_still_compares():
    prior = {k: v for k, v in H1_25.items() if k not in ("currentAssets", "currentLiabilities", "totalAssets",
                                                         "inventory", "prepaidExpenses", "cash")}
    w = analyse(_figures([*THREE_YEARS, *_interim(prior=prior)]))["interim"]
    res = {c["id"]: c["triggered"] for c in w["checks"]}
    assert w["status"] == "ok" and res["margin"] is True and res["acid"] is None
