from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, update
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import base64
import json

from api.deps import get_db, get_current_user
from api.models import User, Assessment
from api.scoring import compute_all_ratios
from api.claude import extract_figures, extract_rating, extract_cp_terms, generate_narrative
from api.report import build_pdf

router = APIRouter()

PLAN_LIMITS = {
    "free"        :  2,
    "starter"     :  5,
    "standard"    : 15,
    "professional": 40,
    "team"        : 100,
    "unlimited"   : 9999,
}

MAX_PDF_SIZE_MB = 20


# ── Schemas ───────────────────────────────────────────────────
class RunAssessmentBody(BaseModel):
    figures    : dict
    clientInfo : dict


class ReportBody(BaseModel):
    assessment_id: int


# ── Helpers ───────────────────────────────────────────────────
async def _get_user(email: str, tenant_id: int, db: AsyncSession) -> User:
    result = await db.execute(
        select(User).where(and_(
            User.email     == email,
            User.tenant_id == tenant_id,
        ))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return user


async def _check_quota(user: User) -> None:
    limit = PLAN_LIMITS.get(user.plan, PLAN_LIMITS["free"])
    if user.credits >= limit:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "quotaExceeded": True,
                "used"         : user.credits,
                "limit"        : limit,
                "plan"         : user.plan,
                "message"      : f"Assessment limit reached ({user.credits}/{limit}). Please upgrade your plan.",
            },
        )


async def _increment_credits(user: User, db: AsyncSession) -> None:
    """
    Atomic increment — prevents race condition from read-then-write.
    Uses UPDATE with WHERE clause so concurrent requests can't both pass quota.
    """
    result = await db.execute(
        update(User)
        .where(and_(
            User.id      == user.id,
            User.credits  < PLAN_LIMITS.get(user.plan, PLAN_LIMITS["free"]),
        ))
        .values(credits=User.credits + 1)
        .returning(User.credits)
    )
    updated = result.fetchone()
    await db.commit()

    if not updated:
        # Row was not updated — quota was hit by a concurrent request
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "quotaExceeded": True,
                "message"      : "Assessment limit reached. Please upgrade your plan.",
            },
        )


def _validate_pdf(file: UploadFile, content: bytes) -> None:
    if len(content) > MAX_PDF_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail=f"PDF exceeds {MAX_PDF_SIZE_MB}MB limit.",
        )
    if not content[:4] == b"%PDF":
        raise HTTPException(
            status_code=400,
            detail="Uploaded file does not appear to be a valid PDF.",
        )


# ── POST /assessment/extract ──────────────────────────────────
@router.post("/extract")
async def extract(
    financial_pdf : UploadFile              = File(...),
    rating_pdf    : Optional[UploadFile]    = File(None),
    cp_terms_pdf  : Optional[UploadFile]    = File(None),
    current_user  : dict                    = Depends(get_current_user),
    db            : AsyncSession            = Depends(get_db),
):
    # Read and validate financial PDF
    fin_bytes = await financial_pdf.read()
    _validate_pdf(financial_pdf, fin_bytes)
    fin_b64 = base64.b64encode(fin_bytes).decode()

    # Extract figures — primary call
    try:
        figures = await extract_figures(fin_b64)
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    result = {"figures": figures}

    # Optional: rating PDF
    if rating_pdf:
        rating_bytes = await rating_pdf.read()
        _validate_pdf(rating_pdf, rating_bytes)
        try:
            result["ratingData"] = await extract_rating(
                base64.b64encode(rating_bytes).decode()
            )
        except RuntimeError as e:
            result["ratingError"] = str(e)

    # Optional: CP terms PDF
    if cp_terms_pdf:
        cp_bytes = await cp_terms_pdf.read()
        _validate_pdf(cp_terms_pdf, cp_bytes)
        try:
            result["cpTerms"] = await extract_cp_terms(
                base64.b64encode(cp_bytes).decode()
            )
        except RuntimeError as e:
            result["cpTermsError"] = str(e)

    return result


# ── POST /assessment/run ──────────────────────────────────────
@router.post("/run")
async def run_assessment(
    body         : RunAssessmentBody,
    current_user : dict          = Depends(get_current_user),
    db           : AsyncSession  = Depends(get_db),
):
    user = await _get_user(current_user["email"], current_user["tenant_id"], db)

    # Quota check — read-only, fast
    await _check_quota(user)

    # Server-side scoring — single source of truth
    score_result = compute_all_ratios(body.figures)

    # Build client info for narrative
    client_info = {
        **body.clientInfo,
        "totalScore": score_result["total_score"],
        "eligible"  : score_result["eligible"],
    }

    # Generate AI narrative
    try:
        narrative = await generate_narrative(
            body.figures,
            score_result["ratios"],
            client_info,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    # Atomic credit increment — handles concurrency
    await _increment_credits(user, db)

    # Log assessment
    assessment = Assessment(
        user_email    = current_user["email"],
        tenant_id     = current_user["tenant_id"],
        client_name   = body.clientInfo.get("clientName"),
        credit_rating = body.clientInfo.get("creditRating"),
        total_score   = score_result["total_score"],
        eligible      = score_result["eligible"],
        figures       = body.figures,
        ratios        = score_result["ratios"],
        narrative     = narrative,
    )
    db.add(assessment)
    await db.commit()
    await db.refresh(assessment)

    return {
        "assessmentId": assessment.id,
        "totalScore"  : score_result["total_score"],
        "maxScore"    : score_result["max_score"],
        "cutoff"      : score_result["cutoff"],
        "eligible"    : score_result["eligible"],
        "ratios"      : score_result["ratios"],
        "narrative"   : narrative,
        "clientInfo"  : client_info,
    }


# ── POST /assessment/report ───────────────────────────────────
@router.post("/report")
async def generate_report(
    body         : ReportBody,
    current_user : dict         = Depends(get_current_user),
    db           : AsyncSession = Depends(get_db),
):
    # Fetch assessment — must belong to this user + tenant
    result = await db.execute(
        select(Assessment).where(and_(
            Assessment.id         == body.assessment_id,
            Assessment.user_email == current_user["email"],
            Assessment.tenant_id  == current_user["tenant_id"],
        ))
    )
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found.")

    try:
        pdf_bytes = build_pdf(assessment)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {e}")

    filename = f"SmartRisk_{(assessment.client_name or 'Report').replace(' ', '_')}.pdf"

    return Response(
        content     = pdf_bytes,
        media_type  = "application/pdf",
        headers     = {"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── GET /assessment/history ───────────────────────────────────
@router.get("/history")
async def history(
    current_user : dict         = Depends(get_current_user),
    db           : AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Assessment)
        .where(and_(
            Assessment.user_email == current_user["email"],
            Assessment.tenant_id  == current_user["tenant_id"],
        ))
        .order_by(Assessment.created_at.desc())
        .limit(50)
    )
    rows = result.scalars().all()

    return [
        {
            "id"           : r.id,
            "clientName"   : r.client_name,
            "creditRating" : r.credit_rating,
            "totalScore"   : r.total_score,
            "eligible"     : r.eligible,
            "createdAt"    : r.created_at.isoformat(),
        }
        for r in rows
    ]