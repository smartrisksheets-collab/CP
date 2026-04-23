from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone
from typing import Optional
import secrets
import resend
import os

from api.db import SessionLocal
from api.models import Tenant, User, Registration, CreditTransaction
from api.deps import get_db, limiter

router = APIRouter()

FREE_CREDITS       = 2
VERIFICATION_EXPIRY = 24  # hours

# ── Disposable email domains blocklist ────────────────────────
DISPOSABLE_DOMAINS = {
    "mailinator.com", "guerrillamail.com", "10minutemail.com",
    "tempmail.com", "throwaway.email", "yopmail.com",
    "sharklasers.com", "guerrillamailblock.com", "grr.la",
    "guerrillamail.info", "guerrillamail.biz", "guerrillamail.de",
    "guerrillamail.net", "guerrillamail.org", "spam4.me",
    "trashmail.com", "trashmail.me", "trashmail.net",
    "dispostable.com", "mailnull.com", "spamgourmet.com",
    "trashmail.at", "trashmail.io", "trashmail.xyz",
    "getnada.com", "maildrop.cc", "discard.email",
    "fakeinbox.com", "tempr.email", "temp-mail.org",
    "emailondeck.com", "owlpic.com", "spamhereplease.com",
}


# ── Schemas ───────────────────────────────────────────────────
class RegisterBody(BaseModel):
    email   : str
    name    : str
    company : Optional[str] = None
    hostname: str


class VerifyEmailBody(BaseModel):
    token: str


# ── Helpers ───────────────────────────────────────────────────
def _validate_email(email: str) -> str:
    email = email.lower().strip()
    parts = email.split("@")
    if len(parts) != 2 or not parts[0] or "." not in parts[1]:
        raise HTTPException(status_code=400, detail="Invalid email address.")
    domain = parts[1]
    if domain in DISPOSABLE_DOMAINS:
        raise HTTPException(status_code=400, detail="Disposable email addresses are not allowed. Please use your work or personal email.")
    return email


async def _send_verification_email(email: str, name: str, token: str, tenant_name: str, hostname: str):
    verify_url = f"https://{hostname}/verify-email?token={token}"
    resend.api_key = os.getenv("RESEND_API_KEY")
    try:
        resend.Emails.send({
            "from"   : f"SmartRisk Credit <noreply@smartrisksheets.com>",
            "to"     : [email],
            "subject": f"Verify your {tenant_name} account",
            "html"   : f"""
                <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;">
                    <h2 style="color:#1F2854;margin-bottom:4px;">{tenant_name}</h2>
                    <p style="color:#5A5A5A;font-size:14px;margin-bottom:24px;">Hi {name}, welcome to SmartRisk Credit.</p>
                    <p style="color:#5A5A5A;font-size:14px;margin-bottom:24px;">
                        Click the button below to verify your email and activate your account.
                        You'll receive <strong>2 free assessment credits</strong> on activation.
                    </p>
                    <a href="{verify_url}"
                       style="display:inline-block;background:#1F2854;color:#fff;padding:14px 28px;
                              border-radius:8px;text-decoration:none;font-size:15px;font-weight:bold;">
                        Verify Email & Activate Account
                    </a>
                    <p style="color:#888;font-size:12px;margin-top:24px;">
                        This link expires in {VERIFICATION_EXPIRY} hours.<br>
                        If you did not create an account, ignore this email.
                    </p>
                    <p style="color:#aaa;font-size:11px;margin-top:8px;">
                        Or copy this link: {verify_url}
                    </p>
                </div>
            """,
        })
    except Exception as e:
        print(f"[verification email error] {e}")
        raise HTTPException(status_code=503, detail="Failed to send verification email. Please try again.")


# ── POST /auth/register ───────────────────────────────────────
@router.post("/register")
@limiter.limit("3/hour")
async def register(
    request: Request,
    body   : RegisterBody,
    db     : AsyncSession = Depends(get_db),
):
    email = _validate_email(body.email)

    # Resolve tenant
    result = await db.execute(select(Tenant).where(Tenant.hostname == body.hostname))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not configured.")

    # Check if already registered and verified
    result = await db.execute(
        select(User).where(and_(
            User.email     == email,
            User.tenant_id == tenant.id,
        ))
    )
    existing_user = result.scalar_one_or_none()

    # Always return same response to prevent email enumeration
    SUCCESS_MSG = {"ok": True, "message": f"Verification email sent to {email}. Check your inbox."}

    if existing_user and existing_user.verified:
        return {
            "ok"     : True,
            "already_verified": True,
            "message": "This email is already registered and verified. Please sign in instead.",
        }

    # Find existing pending registration
    result = await db.execute(
        select(Registration).where(and_(
            Registration.email     == email,
            Registration.tenant_id == tenant.id,
            Registration.verified  == False,
        ))
    )
    existing_reg = result.scalar_one_or_none()

    token      = secrets.token_urlsafe(48)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=VERIFICATION_EXPIRY)

    if existing_reg:
        # Update existing record — no duplicate rows
        existing_reg.verification_token = token
        existing_reg.token_expires_at   = expires_at
        existing_reg.name               = body.name.strip()
        existing_reg.company            = body.company.strip() if body.company else None
    else:
        db.add(Registration(
            email              = email,
            tenant_id          = tenant.id,
            name               = body.name.strip(),
            company            = body.company.strip() if body.company else None,
            verification_token = token,
            token_expires_at   = expires_at,
        ))

    await db.commit()

    # Send verification email
    await _send_verification_email(email, body.name.strip(), token, tenant.client_name, body.hostname)

    return SUCCESS_MSG


# ── GET /auth/verify-email ────────────────────────────────────
class VerifyEmailBody(BaseModel):
    token: str

@router.post("/verify-email")
async def verify_email(body: VerifyEmailBody, db: AsyncSession = Depends(get_db)):
    token = body.token
    # Find registration by token
    result = await db.execute(
        select(Registration).where(
            and_(
                Registration.verification_token == token,
                Registration.verified           == False,
            )
        )
    )
    reg = result.scalar_one_or_none()

    if not reg:
        raise HTTPException(status_code=400, detail="Invalid or already used verification link.")

    # Check expiry
    expires = reg.token_expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires:
        raise HTTPException(status_code=400, detail="Verification link has expired. Please register again.")

    # Mark registration verified
    reg.verified = True

    # Upsert user
    result = await db.execute(
        select(User).where(and_(
            User.email     == reg.email,
            User.tenant_id == reg.tenant_id,
        ))
    )
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            email     = reg.email,
            tenant_id = reg.tenant_id,
            name      = reg.name,
            company   = reg.company,
            verified  = True,
            credits   = FREE_CREDITS,
            plan      = "free",
            role      = "user",
        )
        db.add(user)
    else:
        user.verified = True
        user.name     = reg.name
        user.company  = reg.company
        if user.credits == 0:
            user.credits = FREE_CREDITS

    await db.flush()

    # Log free credit transaction
    expires_at = datetime.now(timezone.utc) + timedelta(days=365)
    db.add(CreditTransaction(
        user_email    = reg.email,
        tenant_id     = reg.tenant_id,
        pack          = "free",
        credits_added = FREE_CREDITS,
        amount_kobo   = 0,
        expires_at    = expires_at,
    ))

    await db.commit()

    return {
        "ok"     : True,
        "message": f"Email verified. {FREE_CREDITS} free credits added to your account.",
        "email"  : reg.email,
    }