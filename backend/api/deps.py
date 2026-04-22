from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from jose import JWTError, jwt
from slowapi import Limiter
from slowapi.util import get_remote_address
from typing import AsyncGenerator
import os

from api.db import SessionLocal
from api.models import User, Tenant

JWT_SECRET    = os.getenv("JWT_SECRET")
JWT_ALGORITHM = "HS256"
SUPERADMIN_KEY = os.getenv("SUPERADMIN_KEY")

bearer_scheme = HTTPBearer(auto_error=False)

# ── Rate limiter (shared across all routes) ───────────────────
limiter = Limiter(key_func=get_remote_address)


# ── DB session ────────────────────────────────────────────────
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


# ── Decode JWT ────────────────────────────────────────────────
def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
        )


# ── Current user — required on all protected routes ───────────
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db          : AsyncSession                = Depends(get_db),
) -> dict:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated.")

    payload   = decode_token(credentials.credentials)
    email     = payload.get("sub")
    tenant_id = payload.get("tenant_id")

    if not email or not tenant_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Malformed token.")

    # Verify user exists and is verified
    result = await db.execute(
        select(User).where(and_(
            User.email     == email,
            User.tenant_id == tenant_id,
        ))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found.")
    if not user.verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email not verified. Check your inbox.")

    # Verify tenant still exists
    tenant = await db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Tenant not found.")

    return {
        "email"    : email,
        "tenant_id": tenant_id,
        "tenant"   : tenant,
        "role"     : user.role,
        "credits"  : user.credits,
        "plan"     : user.plan,
    }


# ── Admin guard ───────────────────────────────────────────────
async def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    if current_user["role"] not in ("admin", "superadmin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required.")
    return current_user


# ── Superadmin guard — for tenant management ──────────────────
async def require_superadmin(request: Request) -> None:
    key = request.headers.get("X-Superadmin-Key")
    if not key or key != SUPERADMIN_KEY:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Superadmin access required.")


# ── Tenant by hostname ────────────────────────────────────────
async def get_tenant_by_hostname(
    hostname: str,
    db      : AsyncSession = Depends(get_db),
) -> Tenant:
    result = await db.execute(select(Tenant).where(Tenant.hostname == hostname))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not configured.")
    return tenant