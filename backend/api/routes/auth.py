from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from jose import jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr
from datetime import datetime, timedelta, timezone
from typing import Optional
import random
import string
import os
import resend

from fastapi import Request
from api.db import SessionLocal
from api.models import Tenant, User, OTP
from api.deps import get_db, get_current_user, JWT_SECRET, JWT_ALGORITHM, limiter

router = APIRouter()

import hashlib

def _hash_otp(otp: str) -> str:
    return hashlib.sha256(otp.encode()).hexdigest()

def _verify_otp_hash(plain: str, hashed: str) -> bool:
    return hashlib.sha256(plain.encode()).hexdigest() == hashed

resend.api_key = os.getenv("RESEND_API_KEY")
OTP_EXPIRY_MINUTES = 10


# ── Schemas ───────────────────────────────────────────────────
class OTPRequestBody(BaseModel):
    email     : str
    hostname  : str
    code      : Optional[str] = None  # access code if tenant requires it


class OTPVerifyBody(BaseModel):
    email    : str
    hostname : str
    otp      : str


# ── Helpers ───────────────────────────────────────────────────
def _generate_otp() -> str:
    return "".join(random.choices(string.digits, k=6))



def _create_jwt(email: str, tenant_id: int, ttl_seconds: int) -> str:
    expire  = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
    payload = {"sub": email, "tenant_id": tenant_id, "exp": expire}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _is_allowed(tenant: Tenant, email: str) -> bool:
    email = email.lower().strip()
    allowed_emails  = [e.lower() for e in (tenant.allowed_emails  or [])]
    allowed_domains = [d.lower() for d in (tenant.allowed_domains or [])]

    if "*" in allowed_domains:
        return True

    if email in allowed_emails:
        return True

    domain = email.split("@")[-1] if "@" in email else ""
    return domain in allowed_domains


async def _send_otp_email(email: str, otp: str, tenant_name: str):
    try:
        resend.Emails.send({
            "from"   : "SmartRisk Credit <noreply@smartrisksheets.com>",
            "to"     : [email],
            "subject": f"Your {tenant_name} verification code",
            "html"   : f"""
                <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;">
                    <h2 style="color:#1F2854;margin-bottom:8px;">{tenant_name}</h2>
                    <p style="color:#5A5A5A;font-size:14px;margin-bottom:24px;">
                        Your verification code is:
                    </p>
                    <div style="background:#F5F5F2;border-radius:8px;padding:24px;text-align:center;
                                font-size:36px;font-weight:bold;letter-spacing:8px;color:#1F2854;">
                        {otp}
                    </div>
                    <p style="color:#888;font-size:12px;margin-top:24px;">
                        This code expires in {OTP_EXPIRY_MINUTES} minutes.<br>
                        If you did not request this, ignore this email.
                    </p>
                </div>
            """,
        })
    except Exception as e:
        # Log but don't expose email provider errors to client
        print(f"[OTP email error] {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to send verification email. Please try again.",
        )


# ── POST /auth/request-otp ────────────────────────────────────
@router.post("/request-otp")
@limiter.limit("5/minute")
async def request_otp(request: Request, body: OTPRequestBody, db: AsyncSession = Depends(get_db)):
    print(f"[request_otp] email={body.email} hostname={body.hostname} code={body.code}")
    # 1. Resolve tenant
    result = await db.execute(select(Tenant).where(Tenant.hostname == body.hostname))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not configured.")

    # 2. Validate access code if tenant requires it
    if tenant.access_code:
        if not body.code or body.code.strip().upper() != tenant.access_code.upper():
            raise HTTPException(status_code=403, detail="Invalid access code.")

    # 3. Check user exists and is verified
    result = await db.execute(
        select(User).where(and_(
            User.email     == body.email.lower(),
            User.tenant_id == tenant.id,
        ))
    )
    existing_user = result.scalar_one_or_none()

    if not existing_user:
        raise HTTPException(
            status_code=403,
            detail="No account found for this email. Please register first.",
        )
    if not existing_user.verified:
        raise HTTPException(
            status_code=403,
            detail="Your email is not yet verified. Please check your inbox for the verification link.",
        )

    # 4. Invalidate any existing unused OTPs for this email + tenant
    existing = await db.execute(
        select(OTP).where(and_(
            OTP.email     == body.email.lower(),
            OTP.tenant_id == tenant.id,
            OTP.used      == False,
        ))
    )
    for old_otp in existing.scalars().all():
        old_otp.used = True
    await db.commit()

    # 5. Generate and store new OTP
    raw_otp    = _generate_otp()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRY_MINUTES)

    db.add(OTP(
        email      = body.email.lower(),
        tenant_id  = tenant.id,
        code_hash  = _hash_otp(raw_otp),
        expires_at = expires_at,
    ))
    await db.commit()

    # 6. Send email
    await _send_otp_email(body.email, raw_otp, tenant.client_name)

    return {"ok": True, "message": f"Verification code sent to {body.email}"}


# ── POST /auth/verify-otp ─────────────────────────────────────
@router.post("/verify-otp")
@limiter.limit("10/minute")
async def verify_otp(request: Request, body: OTPVerifyBody, db: AsyncSession = Depends(get_db)):
    # 1. Resolve tenant
    result = await db.execute(select(Tenant).where(Tenant.hostname == body.hostname))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not configured.")

    # 2. Find latest unused OTP for this email + tenant
    result = await db.execute(
        select(OTP).where(and_(
            OTP.email     == body.email.lower(),
            OTP.tenant_id == tenant.id,
            OTP.used      == False,
        )).order_by(OTP.created_at.desc()).limit(1)
    )
    otp_record = result.scalar_one_or_none()

    if not otp_record:
        raise HTTPException(status_code=400, detail="No active verification code found. Please request a new one.")

    # 3. Check expiry
    if datetime.now(timezone.utc) > otp_record.expires_at.replace(tzinfo=timezone.utc):
        otp_record.used = True
        await db.commit()
        raise HTTPException(status_code=400, detail="Verification code has expired. Please request a new one.")

    # 4. Verify hash — track failed attempts
    if not _verify_otp_hash(body.otp.strip(), otp_record.code_hash):
        otp_record.attempts = (otp_record.attempts or 0) + 1
        if otp_record.attempts >= 5:
            otp_record.used = True
            await db.commit()
            raise HTTPException(status_code=400, detail="Too many incorrect attempts. Please request a new code.")
        await db.commit()
        remaining = 5 - otp_record.attempts
        raise HTTPException(status_code=400, detail=f"Incorrect code. {remaining} attempt{'s' if remaining != 1 else ''} remaining.")

    # 5. Mark OTP used — atomic, no race condition
    otp_record.used = True
    await db.commit()

    # 6. Upsert user record
    result = await db.execute(
        select(User).where(and_(
            User.email     == body.email.lower(),
            User.tenant_id == tenant.id,
        ))
    )
    user = result.scalar_one_or_none()
    if not user:
        user = User(email=body.email.lower(), tenant_id=tenant.id)
        db.add(user)
        await db.commit()
        await db.refresh(user)

    # 7. Issue JWT
    token = _create_jwt(body.email.lower(), tenant.id, tenant.session_ttl)

    return {
        "ok"       : True,
        "token"    : token,
        "email"    : body.email.lower(),
        "plan"     : user.plan,
        "credits"  : user.credits,
        "role"     : user.role,
    }


# ── GET /auth/me ──────────────────────────────────────────────
@router.get("/me")
async def me(
    current_user: dict         = Depends(get_current_user),
    db          : AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).where(and_(
            User.email     == current_user["email"],
            User.tenant_id == current_user["tenant_id"],
        ))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    return {
        "email"  : user.email,
        "plan"   : user.plan,
        "credits": user.credits,
    }


# ── POST /auth/logout ─────────────────────────────────────────
@router.post("/logout")
async def logout():
    # JWT is stateless — logout is handled client-side by deleting the token
    return {"ok": True}