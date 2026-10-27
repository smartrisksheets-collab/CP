from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Request
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, update
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta
import base64

from api.deps import get_db, get_current_user, limiter
from api.models import CreditTransaction, User, Assessment
from api.scoring import compute_all_ratios, normalise_rates, CUTOFF_SCORE
from api.claude import extract_figures, extract_rating, extract_cp_terms, generate_narrative
from api.report import build_pdf

router = APIRouter()

MAX_PDF_SIZE_MB = 20


# ── Schemas ───────────────────────────────────────────────────
class RunAssessmentBody(BaseModel):
    figures          : dict
    clientInfo       : dict
    extractedFigures : Optional[dict] = None
    draftId          : Optional[int]  = None


class ReportBody(BaseModel):
    assessment_id      : int
    narrative_overrides: dict = {}


class NarrativeBody(BaseModel):
    narrative: dict


class FiguresBody(BaseModel):
    figures: dict


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


async def _check_quota(user: User, db: AsyncSession = None) -> None:
    if (user.credits_expire_at and
            user.credits_expire_at < datetime.now(timezone.utc) and
            user.credits > 0 and db is not None):
        await db.execute(
            update(User)
            .where(User.id == user.id)
            .values(credits=0, credits_expire_at=None)
        )
        await db.commit()
        await db.refresh(user)

    if user.credits <= 0:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "quotaExceeded": True,
                "credits"      : user.credits,
                "plan"         : user.plan,
                "message"      : "You have 0 credits remaining. Please purchase a credit pack to continue.",
            },
        )


async def _decrement_credits(user: User, db: AsyncSession, assessment_id: int = None) -> None:

    result = await db.execute(
        update(User)
        .where(and_(User.id == user.id, User.credits > 0))
        .values(credits=User.credits - 1)
        .returning(User.credits)
    )
    updated = result.fetchone()

    if not updated:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "quotaExceeded": True,
                "message"      : "You have 0 credits remaining. Please purchase a credit pack to continue.",
            },
        )

    # Log the debit — completes the ledger
    db.add(CreditTransaction(
        user_email       = user.email,
        tenant_id        = user.tenant_id,
        pack             = user.plan,
        credits_added    = -1,
        amount_kobo      = 0,
        transaction_type = "usage",
        assessment_id    = assessment_id,
        expires_at       = datetime.now(timezone.utc),  # not meaningful for debits but non-null
    ))
    await db.commit()


def _validate_pdf(file: UploadFile, content: bytes) -> None:
    if len(content) > MAX_PDF_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"PDF exceeds {MAX_PDF_SIZE_MB}MB limit.")
    if not content[:4] == b"%PDF":
        raise HTTPException(status_code=400, detail="Uploaded file does not appear to be a valid PDF.")


async def _get_draft(assessment_id: int, email: str, tenant_id: int, db: AsyncSession):
    result = await db.execute(
        select(Assessment).where(and_(
            Assessment.id         == assessment_id,
            Assessment.user_email == email,
            Assessment.tenant_id  == tenant_id,
            Assessment.status     == "draft",
            Assessment.deleted_at == None,
        ))
    )
    return result.scalar_one_or_none()


# ── POST /assessment/extract ──────────────────────────────────
@router.post("/extract")
@limiter.limit("10/minute")
async def extract(
    request       : Request,
    financial_pdf : UploadFile           = File(...),
    rating_pdf    : Optional[UploadFile] = File(None),
    cp_terms_pdf  : Optional[UploadFile] = File(None),
    client_name   : Optional[str]        = Form(None),
    draft_id      : Optional[int]        = Form(None),
    current_user  : dict                 = Depends(get_current_user),
    db            : AsyncSession         = Depends(get_db),
):
    user = await _get_user(current_user["email"], current_user["tenant_id"], db)
    await _check_quota(user, db)
    await _decrement_credits(user, db)

    fin_bytes = await financial_pdf.read()
    _validate_pdf(financial_pdf, fin_bytes)
    fin_b64 = base64.b64encode(fin_bytes).decode()

    try:
        figures = await extract_figures(fin_b64)
    except RuntimeError as e:
        await db.execute(
            update(User)
            .where(User.id == user.id)
            .values(credits=User.credits + 1)
        )
        await db.commit()
        raise HTTPException(status_code=502, detail=str(e))

    result = {"figures": figures}

    if rating_pdf:
        rating_bytes = await rating_pdf.read()
        _validate_pdf(rating_pdf, rating_bytes)
        try:
            result["ratingData"] = await extract_rating(base64.b64encode(rating_bytes).decode())
        except RuntimeError as e:
            result["ratingError"] = str(e)

    if cp_terms_pdf:
        cp_bytes = await cp_terms_pdf.read()
        _validate_pdf(cp_terms_pdf, cp_bytes)
        try:
            result["cpTerms"] = await extract_cp_terms(base64.b64encode(cp_bytes).decode())
        except RuntimeError as e:
            result["cpTermsError"] = str(e)

    # Create or update draft
    draft = None
    if draft_id:
        draft = await _get_draft(draft_id, current_user["email"], current_user["tenant_id"], db)

    if draft:
        draft.client_name       = client_name or draft.client_name
        draft.figures           = figures
        draft.extracted_figures = figures
        draft.updated_at        = datetime.now(timezone.utc)
    else:
        draft = Assessment(
            user_email        = current_user["email"],
            tenant_id         = current_user["tenant_id"],
            client_name       = client_name,
            figures           = figures,
            extracted_figures = figures,
            status            = "draft",
        )
        db.add(draft)

    await db.commit()
    await db.refresh(draft)
    result["draftId"] = draft.id

    return result


# ── POST /assessment/extract-cp ───────────────────────────────
@router.post("/extract-cp")
@limiter.limit("10/minute")
async def extract_cp(
    request      : Request,
    cp_terms_pdf : UploadFile   = File(...),
    current_user : dict         = Depends(get_current_user),
    db           : AsyncSession = Depends(get_db),
):
    cp_bytes = await cp_terms_pdf.read()
    _validate_pdf(cp_terms_pdf, cp_bytes)
    try:
        cp_terms = await extract_cp_terms(base64.b64encode(cp_bytes).decode())
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return {"cpTerms": cp_terms}


# ── POST /assessment/preview ──────────────────────────────────
@router.post("/preview")
@limiter.limit("30/minute")
async def preview_scores(
    request      : Request,
    body         : FiguresBody,
    current_user : dict = Depends(get_current_user),
):
    """Score figures without AI, quota or saving. The Scores step uses it so the
    preview always comes from the same engine as the saved result."""
    return compute_all_ratios(body.figures)


# ── POST /assessment/run ──────────────────────────────────────
@router.post("/run")
@limiter.limit("10/minute")
async def run_assessment(
    request      : Request,
    body         : RunAssessmentBody,
    current_user : dict          = Depends(get_current_user),
    db           : AsyncSession  = Depends(get_db),
):
    user = await _get_user(current_user["email"], current_user["tenant_id"], db)
    await _check_quota(user, db)

    # Idempotency — if draft already completed (e.g. client timeout + retry), return existing result
    if body.draftId:
        existing = await db.execute(
            select(Assessment).where(and_(
                Assessment.id         == body.draftId,
                Assessment.user_email == current_user["email"],
                Assessment.tenant_id  == current_user["tenant_id"],
                Assessment.status     == "complete",
                Assessment.deleted_at == None,
            ))
        )
        completed = existing.scalar_one_or_none()
        if completed:
            return {
                "assessmentId": completed.id,
                "totalScore"  : completed.total_score,
                "maxScore"    : completed.max_score,
                "cutoff"      : CUTOFF_SCORE,
                "modelVersion": completed.model_version,
                "eligible"    : completed.eligible,
                "ratios"      : completed.ratios,
                "narrative"   : completed.narrative,
                "clientInfo"  : {**body.clientInfo, "totalScore": completed.total_score, "eligible": completed.eligible},
            }

    figures      = normalise_rates(body.figures)
    score_result = compute_all_ratios(figures)

    client_info = {
        **body.clientInfo,
        "totalScore": score_result["total_score"],
        "eligible"  : score_result["eligible"],
    }

    try:
        narrative = await generate_narrative(
            figures,
            score_result["ratios"],
            client_info,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    # Update existing draft or create new assessment
    assessment = None
    if body.draftId:
        assessment = await _get_draft(
            body.draftId, current_user["email"], current_user["tenant_id"], db
        )

    if assessment:
        assessment.client_name       = body.clientInfo.get("clientName")
        assessment.credit_rating     = body.clientInfo.get("creditRating")
        assessment.review_date       = body.clientInfo.get("reviewDate")
        assessment.total_score       = score_result["total_score"]
        assessment.max_score         = score_result["max_score"]
        assessment.model_version     = score_result["model_version"]
        assessment.eligible          = score_result["eligible"]
        assessment.figures           = figures
        assessment.extracted_figures = body.extractedFigures
        assessment.ratios            = score_result["ratios"]
        assessment.narrative         = narrative
        assessment.status            = "complete"
        assessment.updated_at        = datetime.now(timezone.utc)
    else:
        assessment = Assessment(
            user_email        = current_user["email"],
            tenant_id         = current_user["tenant_id"],
            client_name       = body.clientInfo.get("clientName"),
            credit_rating     = body.clientInfo.get("creditRating"),
            review_date       = body.clientInfo.get("reviewDate"),
            total_score       = score_result["total_score"],
            max_score         = score_result["max_score"],
            model_version     = score_result["model_version"],
            eligible          = score_result["eligible"],
            figures           = figures,
            extracted_figures = body.extractedFigures,
            ratios            = score_result["ratios"],
            narrative         = narrative,
            status            = "complete",
        )
        db.add(assessment)

    await db.commit()
    await db.refresh(assessment)

    # Back-fill assessment_id on the ledger debit row
    await db.execute(
        update(CreditTransaction)
        .where(and_(
            CreditTransaction.user_email        == current_user["email"],
            CreditTransaction.tenant_id         == current_user["tenant_id"],
            CreditTransaction.transaction_type  == "usage",
            CreditTransaction.assessment_id     == None,
        ))
        .values(assessment_id=assessment.id)
    )
    await db.commit()

    return {
        "assessmentId": assessment.id,
        "totalScore"  : score_result["total_score"],
        "maxScore"    : score_result["max_score"],
        "cutoff"      : score_result["cutoff"],
        "modelVersion": score_result["model_version"],
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
    result = await db.execute(
        select(Assessment).where(and_(
            Assessment.id         == body.assessment_id,
            Assessment.user_email == current_user["email"],
            Assessment.tenant_id  == current_user["tenant_id"],
            Assessment.deleted_at == None,
        ))
    )
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found.")

    # Apply narrative overrides without mutating DB object
    if body.narrative_overrides:
        class _Proxy:
            pass
        proxy = _Proxy()
        proxy.__dict__.update(assessment.__dict__)
        proxy.narrative = {**(assessment.narrative or {}), **body.narrative_overrides}
        target = proxy
    else:
        target = assessment

    try:
        pdf_bytes = build_pdf(target)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {e}")

    filename = f"SmartRisk_{(assessment.client_name or 'Report').replace(' ', '_')}.pdf"
    return Response(
        content    = pdf_bytes,
        media_type = "application/pdf",
        headers    = {"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── GET /assessment/draft ─────────────────────────────────────
@router.get("/draft")
async def get_draft(
    current_user : dict         = Depends(get_current_user),
    db           : AsyncSession = Depends(get_db),
):
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    result = await db.execute(
        select(Assessment)
        .where(and_(
            Assessment.user_email == current_user["email"],
            Assessment.tenant_id  == current_user["tenant_id"],
            Assessment.status     == "draft",
            Assessment.deleted_at == None,
            Assessment.created_at >= cutoff,
        ))
        .order_by(Assessment.created_at.desc())
        .limit(1)
    )
    draft = result.scalar_one_or_none()
    if not draft:
        return None
    return {
        "id"        : draft.id,
        "clientName": draft.client_name,
        "figures"   : normalise_rates(draft.figures) if draft.figures else draft.figures,
        "createdAt" : draft.created_at.isoformat(),
    }


# ── GET /assessment/history ───────────────────────────────────
@router.get("/history")
async def history(
    page         : int          = 1,
    page_size    : int          = 20,
    current_user : dict         = Depends(get_current_user),
    db           : AsyncSession = Depends(get_db),
):
    page_size = min(page_size, 50)
    offset    = (page - 1) * page_size

    result = await db.execute(
        select(Assessment)
        .where(and_(
            Assessment.user_email == current_user["email"],
            Assessment.tenant_id  == current_user["tenant_id"],
            Assessment.status     != "draft",
            Assessment.deleted_at == None,
        ))
        .order_by(Assessment.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    rows = result.scalars().all()

    return [
        {
            "id"          : r.id,
            "clientName"  : r.client_name,
            "creditRating": r.credit_rating,
            "reviewDate"  : r.review_date,
            "totalScore"  : r.total_score,
            "eligible"    : r.eligible,
            "createdAt"   : r.created_at.isoformat(),
            "updatedAt"   : r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in rows
    ]


# ── GET /assessment/{id} ──────────────────────────────────────
@router.get("/{assessment_id}")
async def get_assessment(
    assessment_id : int,
    current_user  : dict         = Depends(get_current_user),
    db            : AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Assessment).where(and_(
            Assessment.id         == assessment_id,
            Assessment.user_email == current_user["email"],
            Assessment.tenant_id  == current_user["tenant_id"],
            Assessment.deleted_at == None,
        ))
    )
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found.")

    return {
        "id"          : assessment.id,
        "clientName"  : assessment.client_name,
        "creditRating": assessment.credit_rating,
        "reviewDate"  : assessment.review_date,
        "totalScore"  : assessment.total_score,
        "maxScore"    : assessment.max_score,
        "modelVersion": assessment.model_version,
        "eligible"    : assessment.eligible,
        "figures"     : assessment.figures,
        "ratios"      : assessment.ratios,
        "narrative"   : assessment.narrative,
        "createdAt"   : assessment.created_at.isoformat(),
        "updatedAt"   : assessment.updated_at.isoformat() if assessment.updated_at else None,
    }


# ── PATCH /assessment/{id}/narrative ─────────────────────────
@router.patch("/{assessment_id}/narrative")
async def update_narrative(
    assessment_id : int,
    body          : NarrativeBody,
    current_user  : dict         = Depends(get_current_user),
    db            : AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Assessment).where(and_(
            Assessment.id         == assessment_id,
            Assessment.user_email == current_user["email"],
            Assessment.tenant_id  == current_user["tenant_id"],
            Assessment.deleted_at == None,
        ))
    )
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found.")

    assessment.narrative  = body.narrative
    assessment.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"saved": True}


# ── PATCH /assessment/{id}/figures ────────────────────────────
@router.patch("/{assessment_id}/figures")
async def update_draft_figures(
    assessment_id : int,
    body          : FiguresBody,
    current_user  : dict         = Depends(get_current_user),
    db            : AsyncSession = Depends(get_db),
):
    draft = await _get_draft(
        assessment_id, current_user["email"], current_user["tenant_id"], db
    )
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found.")

    draft.figures    = body.figures
    draft.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"saved": True}


# ── DELETE /assessment/{id} ───────────────────────────────────
@router.delete("/{assessment_id}")
async def delete_assessment(
    assessment_id : int,
    current_user  : dict         = Depends(get_current_user),
    db            : AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Assessment).where(and_(
            Assessment.id         == assessment_id,
            Assessment.user_email == current_user["email"],
            Assessment.tenant_id  == current_user["tenant_id"],
            Assessment.deleted_at == None,
        ))
    )
    assessment = result.scalar_one_or_none()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found.")

    assessment.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return {"deleted": True}