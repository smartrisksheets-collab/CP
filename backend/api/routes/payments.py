from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone
from typing import Optional
import hmac
import hashlib
import httpx
import os

from api.deps import get_db, get_current_user, limiter
from api.models import User, CreditTransaction

router = APIRouter()

PAYSTACK_SECRET_KEY = os.getenv("PAYSTACK_SECRET_KEY")
PAYSTACK_PUBLIC_KEY = os.getenv("PAYSTACK_PUBLIC_KEY")

# ── Credit packs — single source of truth ─────────────────────
# Amount in kobo (naira × 100)
CREDIT_PACKS = {
    "starter"     : {"credits": 5,  "amount_kobo": 1000,  "label": "Starter"},
    "standard"    : {"credits": 15, "amount_kobo": 5400000,  "label": "Standard"},
    "professional": {"credits": 30, "amount_kobo": 9900000,  "label": "Professional"},
}

CREDIT_EXPIRY_DAYS = 365  # 12 months


# ── Schemas ───────────────────────────────────────────────────
class InitializePaymentBody(BaseModel):
    pack    : str
    hostname: str


# ── Helpers ───────────────────────────────────────────────────
def _verify_paystack_signature(payload: bytes, signature: str) -> bool:
    """HMAC-SHA512 signature verification — rejects spoofed webhooks."""
    expected = hmac.new(
        PAYSTACK_SECRET_KEY.encode("utf-8"),
        payload,
        hashlib.sha512,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


async def _add_credits(
    db         : AsyncSession,
    email      : str,
    tenant_id  : int,
    pack       : str,
    credits    : int,
    amount_kobo: int,
    reference  : str,
) -> None:
    """
    Atomically adds credits to user account and logs the transaction.
    UNIQUE constraint on paystack_reference prevents double-crediting.
    """
    expires_at = datetime.now(timezone.utc) + timedelta(days=CREDIT_EXPIRY_DAYS)

    # Log transaction first — unique constraint catches duplicates
    transaction = CreditTransaction(
        user_email         = email,
        tenant_id          = tenant_id,
        pack               = pack,
        credits_added      = credits,
        amount_kobo        = amount_kobo,
        paystack_reference = reference,
        status             = "success",
        expires_at         = expires_at,
    )
    db.add(transaction)

    # Update user credits and plan
    result = await db.execute(
        select(User).where(and_(
            User.email     == email,
            User.tenant_id == tenant_id,
        ))
    )
    user = result.scalar_one_or_none()
    if user:
        user.credits += credits
        user.plan     = pack


# ── POST /payments/initialize ─────────────────────────────────
@router.post("/initialize")
@limiter.limit("10/hour")
async def initialize_payment(
    request     : Request,
    body        : InitializePaymentBody,
    current_user: dict         = Depends(get_current_user),
    db          : AsyncSession = Depends(get_db),
):
    pack = CREDIT_PACKS.get(body.pack)
    if not pack:
        raise HTTPException(status_code=400, detail=f"Invalid pack. Choose from: {', '.join(CREDIT_PACKS.keys())}")

    environment = os.getenv("ENVIRONMENT", "development")
    if environment == "development":
        callback_url = f"http://localhost:5173/payment/callback"
    else:
        callback_url = f"https://{body.hostname}/payment/callback"

    payload = {
        "email"       : current_user["email"],
        "amount"      : pack["amount_kobo"],
        "currency"    : "NGN",
        "callback_url": callback_url,
        "metadata"    : {
            "pack"     : body.pack,
            "email"    : current_user["email"],
            "tenant_id": current_user["tenant_id"],
            "credits"  : pack["credits"],
        },
        "channels": ["card", "bank", "ussd", "qr", "mobile_money", "bank_transfer"],
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.paystack.co/transaction/initialize",
            json   = payload,
            headers= {
                "Authorization": f"Bearer {PAYSTACK_SECRET_KEY}",
                "Content-Type" : "application/json",
            },
            timeout=30,
        )

    if response.status_code != 200:
        raise HTTPException(status_code=502, detail="Payment initialization failed. Please try again.")

    data = response.json()
    if not data.get("status"):
        raise HTTPException(status_code=502, detail=data.get("message", "Payment initialization failed."))

    return {
        "authorization_url": data["data"]["authorization_url"],
        "reference"        : data["data"]["reference"],
        "pack"             : body.pack,
        "credits"          : pack["credits"],
        "amount_naira"     : pack["amount_kobo"] // 100,
    }


# ── POST /payments/webhook ────────────────────────────────────
# Paystack calls this endpoint on every payment event.
# This route must be fast — Paystack expects a 200 within 5s.
@router.post("/webhook")
async def paystack_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    # 1. Read raw body — must be before any parsing
    payload   = await request.body()
    signature = request.headers.get("x-paystack-signature", "")

    # 2. Verify HMAC signature — reject anything that fails
    if not _verify_paystack_signature(payload, signature):
        raise HTTPException(status_code=400, detail="Invalid signature.")

    # 3. Parse event
    import json
    try:
        event = json.loads(payload)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid payload.")

    # 4. Only process successful charge events
    if event.get("event") != "charge.success":
        return {"ok": True}  # acknowledge other events without processing

    data      = event.get("data", {})
    reference = data.get("reference")
    metadata  = data.get("metadata", {})
    email     = metadata.get("email", "").lower().strip()
    pack_key  = metadata.get("pack", "")
    tenant_id = metadata.get("tenant_id")
    amount    = data.get("amount", 0)  # in kobo

    # 5. Validate required fields
    if not all([reference, email, pack_key, tenant_id]):
        return {"ok": True}  # malformed metadata — acknowledge silently

    # 6. Validate pack exists
    pack = CREDIT_PACKS.get(pack_key)
    if not pack:
        return {"ok": True}

    # 7. Validate amount matches expected pack price — prevents partial payment abuse
    if amount != pack["amount_kobo"]:
        print(f"[webhook] Amount mismatch for {reference}: got {amount}, expected {pack['amount_kobo']}")
        return {"ok": True}  # acknowledge but don't credit

    # 8. Add credits — UNIQUE constraint on reference prevents double-crediting
    try:
        await _add_credits(
            db         = db,
            email      = email,
            tenant_id  = int(tenant_id),
            pack       = pack_key,
            credits    = pack["credits"],
            amount_kobo= amount,
            reference  = reference,
        )
        await db.commit()
        print(f"[webhook] Credited {pack['credits']} credits to {email} for {reference}")

    except IntegrityError:
        # Duplicate reference — webhook already processed
        await db.rollback()
        print(f"[webhook] Duplicate reference ignored: {reference}")

    except Exception as e:
        await db.rollback()
        print(f"[webhook] Error processing {reference}: {e}")

    # Always return 200 to Paystack — never let them retry unnecessarily
    return {"ok": True}


# ── GET /payments/verify/{reference} ─────────────────────────
# Called after redirect from Paystack checkout.
# Double-checks payment status before showing success screen.
@router.get("/verify/{reference}")
async def verify_payment(
    reference   : str,
    current_user: dict         = Depends(get_current_user),
    db          : AsyncSession = Depends(get_db),
):
    # Check if already credited via webhook
    result = await db.execute(
        select(CreditTransaction).where(
            CreditTransaction.paystack_reference == reference
        )
    )
    transaction = result.scalar_one_or_none()

    if transaction:
        return {
            "ok"          : True,
            "already_credited": True,
            "pack"        : transaction.pack,
            "credits_added": transaction.credits_added,
        }

    # Webhook hasn't fired yet — verify directly with Paystack
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"https://api.paystack.co/transaction/verify/{reference}",
            headers={"Authorization": f"Bearer {PAYSTACK_SECRET_KEY}"},
            timeout=30,
        )

    if response.status_code != 200:
        raise HTTPException(status_code=502, detail="Could not verify payment. Please contact support.")

    data   = response.json().get("data", {})
    status = data.get("status")

    if status != "success":
        return {"ok": False, "status": status, "message": "Payment not successful."}

    # Payment confirmed but webhook hasn't fired — credit manually
    metadata  = data.get("metadata", {})
    pack_key  = metadata.get("pack", "")
    tenant_id = metadata.get("tenant_id")
    amount    = data.get("amount", 0)
    pack      = CREDIT_PACKS.get(pack_key)

    if not pack or amount != pack["amount_kobo"]:
        raise HTTPException(status_code=400, detail="Payment verification failed — pack mismatch.")

    try:
        await _add_credits(
            db         = db,
            email      = current_user["email"],
            tenant_id  = int(tenant_id),
            pack       = pack_key,
            credits    = pack["credits"],
            amount_kobo= amount,
            reference  = reference,
        )
        await db.commit()
    except IntegrityError:
        await db.rollback()  # webhook beat us to it — no problem

    return {
        "ok"          : True,
        "pack"        : pack_key,
        "credits_added": pack["credits"],
    }


# ── GET /payments/packs ───────────────────────────────────────
@router.get("/packs")
async def get_packs():
    """Public — returns available credit packs for the pricing UI."""
    return [
        {
            "key"         : key,
            "label"       : pack["label"],
            "credits"     : pack["credits"],
            "amount_naira": pack["amount_kobo"] // 100,
            "per_credit"  : (pack["amount_kobo"] // 100) // pack["credits"],
        }
        for key, pack in CREDIT_PACKS.items()
    ]