"""Instrument choice: CP, bond or note, loan or facility, general review (D052)."""
import os
import shutil
import subprocess
from datetime import datetime, timezone
from types import SimpleNamespace

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")  # db.py needs it at import

import pytest  # noqa: E402

from api.instruments import (INSTRUMENTS, clean_terms, instrument_line, instrument_of,  # noqa: E402
                             narrative_block, normalise_instrument, report_title)
from api.report import build_pdf  # noqa: E402
from api.scoring import compute_all_ratios  # noqa: E402
from tests.test_scoring import STREADVEST  # noqa: E402


def test_codes():
    assert set(INSTRUMENTS) == {"cp", "bond", "loan", "review"}
    assert normalise_instrument(" Bond ") == "bond"
    assert normalise_instrument("eurobond") is None
    assert instrument_of({}) == "cp" and instrument_of({"instrument": "x"}) == "cp"
    assert instrument_of({"instrument": "loan"}) == "loan"


def test_titles_and_lines():
    assert report_title("cp") == "Commercial Paper Assessment"
    assert report_title("review") == "Corporate Credit Review"
    assert instrument_line("cp", None) == "Senior Unsecured Commercial Paper"
    assert instrument_line("bond", {"security": "Senior secured"}) == "Senior secured corporate bond / note"
    assert instrument_line("loan", {"facilityType": "Term loan"}) == "Term loan"
    assert instrument_line("loan", {}) == "Loan / Facility"


def test_clean_terms():
    assert clean_terms("bond", {"coupon": "  17.5% ", "junk": "x"}) == {
        **{k: None for k in clean_terms("bond", {"coupon": "a"})}, "coupon": "17.5%"}
    assert clean_terms("bond", {"coupon": ""}) is None
    assert clean_terms("cp", {"coupon": "1"}) is None
    assert clean_terms("review", {"amount": "1"}) is None
    assert len(clean_terms("loan", {"purpose": "x" * 500})["purpose"]) == 300


def test_narrative_block():
    assert narrative_block({}) == ""
    block = narrative_block({"instrument": "loan", "terms": {"amount": "N5bn", "tenor": "36 months"}})
    assert "Loan or facility" in block and "Amount: N5bn" in block and "Tenor: 36 months" in block
    assert "general creditworthiness" in narrative_block({"instrument": "review"})


def _pdf_text(figures):
    result = compute_all_ratios(figures)
    a = SimpleNamespace(figures=figures, narrative={}, ratios=result["ratios"], total_score=result["total_score"],
                        max_score=56, eligible=result["eligible"], client_name="Streadvest Nigeria Limited",
                        credit_rating="BBB+", model_version="v2.1", created_at=datetime.now(timezone.utc))
    pdf = build_pdf(a)
    assert pdf[:4] == b"%PDF"
    if not shutil.which("pdftotext"):
        pytest.skip("pdftotext not installed")
    out = subprocess.run(["pdftotext", "-", "-"], input=pdf, capture_output=True, check=True).stdout.decode()
    return " ".join(out.split())


def test_cp_report_unchanged():
    text = _pdf_text(STREADVEST)
    assert "Commercial Paper Assessment" in text and "COMMERCIAL PAPER TERMS" in text
    assert "calibrated on commercial paper issuers" not in text


def test_bond_report():
    text = _pdf_text({**STREADVEST, "instrument": "bond",
                      "terms": {"coupon": "18.25%", "maturityDate": "15 June 2031", "security": "Senior unsecured"}})
    assert "Corporate Bond Assessment" in text and "BOND / NOTE TERMS" in text
    assert "18.25%" in text and "COMMERCIAL PAPER TERMS" not in text
    assert "Senior unsecured corporate bond / note" in text
    assert "calibrated on commercial paper issuers" in text


def test_loan_report_without_terms():
    text = _pdf_text({**STREADVEST, "instrument": "loan"})
    assert "Loan Assessment" in text and "No terms were entered" in text


def test_review_report_has_no_terms_section():
    text = _pdf_text({**STREADVEST, "instrument": "review"})
    assert "Corporate Credit Review" in text
    assert "TERMS" not in text.replace("Terms", "")


def test_narrative_prompt_follows_instrument(monkeypatch):
    import asyncio
    from api import claude
    seen = []

    async def fake_text(prompt):
        seen.append(prompt)
        return '{"recommendation": "ok"}'

    monkeypatch.setattr(claude, "_call_text_only", fake_text)
    result = compute_all_ratios(STREADVEST)
    info = {"clientName": "X", "totalScore": 50, "eligible": True}
    asyncio.run(claude.generate_narrative({**STREADVEST, "instrument": "loan", "terms": {"amount": "N5bn"}},
                                          result["ratios"], info))
    asyncio.run(claude.generate_narrative(STREADVEST, result["ratios"], info))
    loan, cp = seen
    assert "INSTRUMENT BEING ASSESSED: Loan or facility" in loan and "Amount: N5bn" in loan
    assert "supports credit consideration" in loan and "credit decision" in loan
    assert "INSTRUMENT BEING ASSESSED" not in cp and "supports investment consideration" in cp


LOAN_TERMS = {"amount": "500,000,000", "tenor": "24", "interestRate": "22", "repayment": "amortising",
              "facilityType": "Term loan"}


def test_loan_report_has_repayment_check():
    text = _pdf_text({**STREADVEST, "instrument": "loan", "terms": LOAN_TERMS})
    assert "REPAYMENT CHECK" in text and "REPAYMENT: " in text and "Indicative score" in text
    assert "Debt service cover" in text and "Credit Committee Recommendation" in text


def test_loan_report_asks_for_missing_terms():
    text = _pdf_text({**STREADVEST, "instrument": "loan", "terms": {"facilityType": "Overdraft"}})
    assert "REPAYMENT CHECK" in text and "to run the repayment check" in text


def test_review_report_is_a_health_report():
    text = _pdf_text({**STREADVEST, "instrument": "review"})
    assert "HEALTH:" in text and "Health score" in text and "Overall View" in text
    assert "THRESHOLD" not in text and "Threshold" not in text and "cut-off" not in text


def test_narrative_prompt_for_loan_and_review(monkeypatch):
    import asyncio
    from api import claude
    seen = []

    async def fake_text(prompt):
        seen.append(prompt)
        return '{"recommendation": "ok"}'

    monkeypatch.setattr(claude, "_call_text_only", fake_text)
    result = compute_all_ratios(STREADVEST)
    info = {"clientName": "X", "totalScore": 50, "eligible": True}
    asyncio.run(claude.generate_narrative({**STREADVEST, "instrument": "loan", "terms": LOAN_TERMS},
                                          result["ratios"], info))
    asyncio.run(claude.generate_narrative({**STREADVEST, "instrument": "review"}, result["ratios"], info))
    loan, review = seen
    assert "REPAYMENT CHECK" in loan and "1.5x guide" in loan
    assert "HEALTH REPORT" in review and "Eligible:" not in review and "Score Tier" not in review
    assert "NEVER mention a pass mark" in review
