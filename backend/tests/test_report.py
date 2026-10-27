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
