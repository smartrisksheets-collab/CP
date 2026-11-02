from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone
from typing import Optional

from api.deps import get_db, require_admin, get_current_user
from api.models import User, Assessment, CreditTransaction, EmailAllowlist
from api.allowlist import normalize_email, is_personal, get_entry, is_revoked

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


class AllowlistAddBody(BaseModel):
    email : str
    note  : str | None = None


class AllowlistRevokeBody(BaseModel):
    email : str


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

    revoked_result = await db.execute(
        select(EmailAllowlist.email).where(and_(
            EmailAllowlist.tenant_id == current_user["tenant_id"],
            EmailAllowlist.revoked_at.is_not(None),
        ))
    )
    revoked = set(revoked_result.scalars().all())

    return [
        {
            "email"              : u.email,
            "name"               : u.name,
            "company"            : u.company,
            "role"               : u.role,
            "plan"               : u.plan,
            "credits"            : u.credits,
            "verified"           : u.verified,
            "accessRevoked"      : u.email in revoked,
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
            User.email     == email.lower().strip(),
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
            CreditTransaction.user_email == email.lower().strip(),
            CreditTransaction.tenant_id  == current_user["tenant_id"],
        ))
        .order_by(CreditTransaction.created_at.desc())
    )
    transactions = tx_result.scalars().all()

    # Get assessment count
    count_result = await db.execute(
        select(func.count(Assessment.id)).where(and_(
            Assessment.user_email == email.lower().strip(),
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
            User.email     == body.email.lower().strip(),
            User.tenant_id == current_user["tenant_id"],
        ))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    if body.amount == 0:
        raise HTTPException(status_code=400, detail="Amount cannot be 0.")

    new_balance = user.credits + body.amount
    if new_balance < 0:
        raise HTTPException(status_code=400, detail=f"Cannot reduce credits below 0. Current balance: {user.credits}")

    user.credits = new_balance

    # Log the manual adjustment
    if body.amount > 0:
        expires_at = datetime.now(timezone.utc) + timedelta(days=CREDIT_EXPIRY_DAYS)
        db.add(CreditTransaction(
            user_email    = body.email.lower().strip(),
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
        "email"     : body.email.lower().strip(),
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
    if body.email.lower().strip() == current_user["email"] and body.role == "user":
        raise HTTPException(status_code=400, detail="You cannot demote yourself.")

    result = await db.execute(
        select(User).where(and_(
            User.email     == body.email.lower().strip(),
            User.tenant_id == current_user["tenant_id"],
        ))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    # Prevent demoting a superadmin
    if user.role == "superadmin":
        raise HTTPException(status_code=403, detail="Cannot change superadmin role.")

    if body.role == "admin" and await is_revoked(db, current_user["tenant_id"], user.email):
        raise HTTPException(status_code=400, detail="This user's access is revoked. Restore their email first.")

    user.role = body.role
    await db.commit()

    return {"ok": True, "email": body.email.lower().strip(), "role": body.role}


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


# ── Test email allowlist (personal domains) ───────────────────
def _allowlist_row(e: EmailAllowlist, has_account: bool) -> dict:
    return {
        "email"     : e.email,
        "note"      : e.note,
        "addedBy"   : e.added_by,
        "createdAt" : e.created_at.isoformat(),
        "revokedAt" : e.revoked_at.isoformat() if e.revoked_at is not None else None,
        "revokedBy" : e.revoked_by,
        "active"    : e.revoked_at is None,
        "hasAccount": has_account,
    }


def _normalized(raw: str) -> str:
    try:
        return normalize_email(raw)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


async def _has_account(db: AsyncSession, tenant_id: int, email: str) -> bool:
    result = await db.execute(
        select(User.id).where(and_(User.email == email, User.tenant_id == tenant_id))
    )
    return result.scalar_one_or_none() is not None


# ── GET /admin/allowlist ──────────────────────────────────────
@router.get("/allowlist")
async def list_allowlist(
    current_user: dict         = Depends(require_admin),
    db          : AsyncSession = Depends(get_db),
):
    tenant_id = current_user["tenant_id"]
    result = await db.execute(
        select(EmailAllowlist)
        .where(EmailAllowlist.tenant_id == tenant_id)
        .order_by(EmailAllowlist.created_at.desc())
    )
    entries = result.scalars().all()

    users = await db.execute(
        select(User.email).where(and_(
            User.tenant_id == tenant_id,
            User.email.in_([e.email for e in entries]),
        ))
    ) if entries else None
    registered = set(users.scalars().all()) if users is not None else set()

    return [_allowlist_row(e, e.email in registered) for e in entries]


# ── POST /admin/allowlist ─────────────────────────────────────
@router.post("/allowlist")
async def add_allowlist(
    body        : AllowlistAddBody,
    current_user: dict         = Depends(require_admin),
    db          : AsyncSession = Depends(get_db),
):
    tenant_id = current_user["tenant_id"]
    email     = _normalized(body.email)
    note      = (body.note or "").strip() or None

    if not is_personal(email):
        raise HTTPException(status_code=400, detail="Only personal email addresses (Gmail, Yahoo, ...) need adding. Work emails can register directly.")

    entry = await get_entry(db, tenant_id, email)
    if entry is not None and entry.revoked_at is None:
        raise HTTPException(status_code=409, detail="This email is already on the list.")

    if entry is not None:
        # Re-adding a revoked email restores access
        entry.revoked_at = None
        entry.revoked_by = None
        entry.added_by   = current_user["email"]
        if note is not None:
            entry.note = note
    else:
        entry = EmailAllowlist(
            tenant_id = tenant_id,
            email     = email,
            note      = note,
            added_by  = current_user["email"],
        )
        db.add(entry)

    try:
        await db.commit()
    except IntegrityError:
        # Two admins adding the same email at once
        await db.rollback()
        raise HTTPException(status_code=409, detail="This email is already on the list.")
    await db.refresh(entry)

    return _allowlist_row(entry, await _has_account(db, tenant_id, email))


# ── POST /admin/allowlist/revoke ──────────────────────────────
@router.post("/allowlist/revoke")
async def revoke_allowlist(
    body        : AllowlistRevokeBody,
    current_user: dict         = Depends(require_admin),
    db          : AsyncSession = Depends(get_db),
):
    tenant_id = current_user["tenant_id"]
    email     = _normalized(body.email)

    if email == current_user["email"]:
        raise HTTPException(status_code=400, detail="You cannot revoke your own email.")

    entry = await get_entry(db, tenant_id, email)
    if entry is None:
        raise HTTPException(status_code=404, detail="Email not found on the list.")
    if entry.revoked_at is not None:
        raise HTTPException(status_code=409, detail="This email is already revoked.")

    result = await db.execute(
        select(User).where(and_(User.email == email, User.tenant_id == tenant_id))
    )
    user = result.scalar_one_or_none()
    if user is not None and user.role == "superadmin" and current_user["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="Only a superadmin can revoke a superadmin.")

    entry.revoked_at = datetime.now(timezone.utc)
    entry.revoked_by = current_user["email"]
    await db.commit()
    await db.refresh(entry)

    return _allowlist_row(entry, user is not None)
