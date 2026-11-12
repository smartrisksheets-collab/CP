from datetime import datetime, timezone
from types import SimpleNamespace

from api.report import build_pdf
from api.scoring import compute_all_ratios
from tests.test_scoring import STREADVEST


def _assessment(ratios, score):
    return SimpleNamespace(
        figures=STREADVEST, narrative={}, ratios=ratios, total_score=score, max_score=56,
        eligible=True, client_name="Streadvest Nigeria Limited", credit_rating="BBB+", model_version="v1.2",
        created_at=datetime.now(timezone.utc),
    )


def test_report_builds_with_display_only_ratios():
    result = compute_all_ratios(STREADVEST)
    assert build_pdf(_assessment(result["ratios"], result["total_score"]))[:4] == b"%PDF"


def test_report_builds_for_assessment_saved_before_liquidity_ratios():
    # Older saved results have no current_ratio or cash_ratio; the header falls back to the engine
    result = compute_all_ratios(STREADVEST)
    legacy = [r for r in result["ratios"] if r["id"] not in ("current_ratio", "cash_ratio")]
    for r in legacy:
        r.pop("display_only")
    assert build_pdf(_assessment(legacy, result["total_score"]))[:4] == b"%PDF"


# ── Issuer history section ────────────────────────────────────
def _history_assessment(periods, **hist):
    from tests.test_history import FY25, _figures, analyse
    figs = _figures(periods, **hist)
    result = compute_all_ratios(figs)
    a = _assessment(result["ratios"], result["total_score"])
    a.figures, a.history = figs, analyse(figs)
    a.narrative = {"historicalReview": "Profitability weakened from FY2023 to FY2025."}
    return a


def test_report_builds_with_history_and_interim():
    from tests.test_history import THREE_YEARS, _interim
    a = _history_assessment([*THREE_YEARS, *_interim()], analystComment="Seasonal second quarter")
    assert a.history["interim"]["status"] == "ok"
    assert build_pdf(a)[:4] == b"%PDF"


def test_report_builds_with_two_years_no_interim():
    from tests.test_history import THREE_YEARS
    a = _history_assessment(THREE_YEARS[:1])
    assert a.history["yearsAvailable"] == 2
    assert build_pdf(a)[:4] == b"%PDF"


def test_report_skips_history_when_limited():
    a = _history_assessment([])
    assert a.history["yearsAvailable"] == 1
    assert build_pdf(a)[:4] == b"%PDF"


def test_report_without_history_attribute():
    # Assessments saved before 0005 have no history; SimpleNamespace without the attribute
    result = compute_all_ratios(STREADVEST)
    assert build_pdf(_assessment(result["ratios"], result["total_score"]))[:4] == b"%PDF"
