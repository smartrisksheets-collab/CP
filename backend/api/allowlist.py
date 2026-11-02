"""
Email rules shared by registration, login and the admin allowlist.

Personal domains (gmail, yahoo, ...) are blocked at registration unless an
admin allowlists the exact address on that tenant. A revoked entry also
blocks an existing account (login and every API call).
"""
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from api.models import EmailAllowlist


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


# ── Personal / consumer email domains ─────────────────────────
PERSONAL_DOMAINS = {
    "gmail.com", "yahoo.com", "yahoo.co.uk", "yahoo.co.in",
    "outlook.com", "hotmail.com", "hotmail.co.uk", "live.com",
    "icloud.com", "me.com", "mac.com", "aol.com",
    "protonmail.com", "proton.me", "zoho.com",
    "yandex.com", "yandex.ru", "gmx.com", "gmx.net",
}


def normalize_email(raw: str) -> str:
    """Lowercase, trim and drop a + alias (john+test@gmail.com becomes john@gmail.com).
    Raises ValueError with a user-facing message for invalid or disposable addresses."""
    email = str(raw or "").lower().strip()
    parts = email.split("@")
    if len(parts) != 2 or not parts[0] or "." not in parts[1]:
        raise ValueError("Invalid email address.")
    local, domain = parts[0].split("+")[0], parts[1]
    if not local:
        raise ValueError("Invalid email address.")
    if domain in DISPOSABLE_DOMAINS:
        raise ValueError("Disposable email addresses are not allowed.")
    return f"{local}@{domain}"


def is_personal(email: str) -> bool:
    return email.rsplit("@", 1)[-1] in PERSONAL_DOMAINS


async def get_entry(db: AsyncSession, tenant_id: int, email: str) -> EmailAllowlist | None:
    result = await db.execute(
        select(EmailAllowlist).where(and_(
            EmailAllowlist.tenant_id == tenant_id,
            EmailAllowlist.email     == email,
        ))
    )
    return result.scalar_one_or_none()


async def is_revoked(db: AsyncSession, tenant_id: int, email: str) -> bool:
    # Only a revoked entry blocks. Personal-domain accounts created before the
    # allowlist existed (no entry) keep working.
    if not is_personal(email):
        return False
    entry = await get_entry(db, tenant_id, email)
    return entry is not None and entry.revoked_at is not None
