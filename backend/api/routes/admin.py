from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone
from typing import Optional

from api.deps import get_db, require_admin, get_current_user
from api.models import User, Assessment, CreditTransaction

router = APIRouter()

CREDIT_EXPIRY_DAYS = 365


# ── Schemas ───────────────────────────────────────────────────
class AdjustCreditsBody(BaseModel):
    email  : str
    amount : int    # positive = add, negative = remove
    reason : str


class SetRoleBody(BaseModel):
    email : str
    role  : str     # user | admin


# ── GET /admin/users ──────────────────────────────────────────
@router.get("/users")
async def list_users(
    current_user: dict         = Depends(require_admin),
    db          : AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User)
        .where(User.tenant_id == current_user["tenant_id"])
        .order_by(User.created_at.desc())
    )
    users = result.scalars().all()

    return [
        {
            "email"              : u.email,
            "name"               : u.name,
            "company"            : u.company,
            "role"               : u.role,
            "plan"               : u.plan,
            "credits"            : u.credits,
            "verified"           : u.verified,
            "createdAt"          : u.created_at.isoformat(),
            "onboardingRole"     : u.onboarding_role,
            "onboardingProcess"  : u.onboarding_process,
            "onboardingVolume"   : u.onboarding_volume,
        }
        for u in users
    ]


# ── GET /admin/users/{email} ──────────────────────────────────
@router.get("/users/{email}")
async def get_user(
    email       : str,
    current_user: dict         = Depends(require_admin),
    db          : AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(and_(
            User.email     == email.lower(),
            User.tenant_id == current_user["tenant_id"],
        ))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    # Get credit transaction history
    tx_result = await db.execute(
        select(CreditTransaction)
        .where(and_(
            CreditTransaction.user_email == email.lower(),
            CreditTransaction.tenant_id  == current_user["tenant_id"],
        ))
        .order_by(CreditTransaction.created_at.desc())
    )
    transactions = tx_result.scalars().all()

    # Get assessment count
    count_result = await db.execute(
        select(func.count(Assessment.id)).where(and_(
            Assessment.user_email == email.lower(),
            Assessment.tenant_id  == current_user["tenant_id"],
        ))
    )
    assessment_count = count_result.scalar()

    return {
        "email"           : user.email,
        "name"            : user.name,
        "company"         : user.company,
        "role"            : user.role,
        "plan"            : user.plan,
        "credits"         : user.credits,
        "verified"        : user.verified,
        "createdAt"       : user.created_at.isoformat(),
        "assessmentCount" : assessment_count,
        "transactions"    : [
            {
                "pack"             : t.pack,
                "creditsAdded"     : t.credits_added,
                "amountNaira"      : t.amount_kobo // 100,
                "paystackReference": t.paystack_reference,
                "status"           : t.status,
                "expiresAt"        : t.expires_at.isoformat(),
                "createdAt"        : t.created_at.isoformat(),
            }
            for t in transactions
        ],
    }


# ── POST /admin/users/credits ─────────────────────────────────
@router.post("/users/credits")
async def adjust_credits(
    body        : AdjustCreditsBody,
    current_user: dict         = Depends(require_admin),
    db          : AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(and_(
            User.email     == body.email.lower(),
            User.tenant_id == current_user["tenant_id"],
        ))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    new_balance = user.credits + body.amount
    if new_balance < 0:
        raise HTTPException(status_code=400, detail=f"Cannot reduce credits below 0. Current balance: {user.credits}")

    user.credits = new_balance

    # Log the manual adjustment
    if body.amount > 0:
        expires_at = datetime.now(timezone.utc) + timedelta(days=CREDIT_EXPIRY_DAYS)
        db.add(CreditTransaction(
            user_email    = body.email.lower(),
            tenant_id     = current_user["tenant_id"],
            pack          = "manual",
            credits_added = body.amount,
            amount_kobo   = 0,
            expires_at    = expires_at,
            status        = "success",
        ))

    await db.commit()

    return {
        "ok"        : True,
        "email"     : body.email.lower(),
        "adjustment": body.amount,
        "newBalance": new_balance,
        "reason"    : body.reason,
    }


# ── POST /admin/users/role ────────────────────────────────────
@router.post("/users/role")
async def set_role(
    body        : SetRoleBody,
    current_user: dict         = Depends(require_admin),
    db          : AsyncSession = Depends(get_db),
):
    if body.role not in ("user", "admin"):
        raise HTTPException(status_code=400, detail="Role must be 'user' or 'admin'.")

    # Prevent self-demotion
    if body.email.lower() == current_user["email"] and body.role == "user":
        raise HTTPException(status_code=400, detail="You cannot demote yourself.")

    result = await db.execute(
        select(User).where(and_(
            User.email     == body.email.lower(),
            User.tenant_id == current_user["tenant_id"],
        ))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    # Prevent demoting a superadmin
    if user.role == "superadmin":
        raise HTTPException(status_code=403, detail="Cannot change superadmin role.")

    user.role = body.role
    await db.commit()

    return {"ok": True, "email": body.email.lower(), "role": body.role}


# ── GET /admin/assessments ────────────────────────────────────
@router.get("/assessments")
async def list_assessments(
    current_user: dict         = Depends(require_admin),
    db          : AsyncSession = Depends(get_db),
    limit       : int          = 100,
    offset      : int          = 0,
):
    result = await db.execute(
        select(Assessment)
        .where(Assessment.tenant_id == current_user["tenant_id"])
        .order_by(Assessment.created_at.desc())
        .limit(min(limit, 200))
        .offset(offset)
    )
    rows = result.scalars().all()

    return [
        {
            "id"          : r.id,
            "userEmail"   : r.user_email,
            "clientName"  : r.client_name,
            "creditRating": r.credit_rating,
            "totalScore"  : r.total_score,
            "eligible"    : r.eligible,
            "createdAt"   : r.created_at.isoformat(),
        }
        for r in rows
    ]


# ── GET /admin/stats ──────────────────────
@router.get("/stats")
async def stats(
    current_user: dict         = Depends(require_admin),
    db          : AsyncSession = Depends(get_db),
):
    tenant_id = current_user["tenant_id"]

    total_users = await db.execute(
        select(func.count(User.id)).where(User.tenant_id == tenant_id)
    )
    verified_users = await db.execute(
        select(func.count(User.id)).where(and_(
            User.tenant_id == tenant_id, User.verified == True
        ))
    )
    total_assessments = await db.execute(
        select(func.count(Assessment.id)).where(Assessment.tenant_id == tenant_id)
    )
    total_revenue = await db.execute(
        select(func.sum(CreditTransaction.amount_kobo)).where(and_(
            CreditTransaction.tenant_id == tenant_id,
            CreditTransaction.status    == "success",
            CreditTransaction.amount_kobo > 0,
        ))
    )

    revenue_kobo = total_revenue.scalar() or 0

    return {
        "totalUsers"      : total_users.scalar(),
        "verifiedUsers"   : verified_users.scalar(),
        "totalAssessments": total_assessments.scalar(),
        "totalRevenueNaira": revenue_kobo // 100,
    }