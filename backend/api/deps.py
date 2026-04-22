from fastapi import Depends, HTTPException, status, Cookie
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import JWTError, jwt
from typing import AsyncGenerator
import os

from api.db import SessionLocal
from api.models import User, Tenant

JWT_SECRET    = os.getenv("JWT_SECRET")
JWT_ALGORITHM = "HS256"

bearer_scheme = HTTPBearer(auto_error=False)


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


# ── Current user — required on protected routes ───────────────
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated.",
        )

    payload = decode_token(credentials.credentials)

    email     = payload.get("sub")
    tenant_id = payload.get("tenant_id")

    if not email or not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token.",
        )

    # Verify tenant still exists
    tenant = await db.get(Tenant, tenant_id)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tenant not found.",
        )

    return {"email": email, "tenant_id": tenant_id, "tenant": tenant}


# ── Tenant only — for public routes that need branding ────────
async def get_tenant_by_hostname(
    hostname: str,
    db: AsyncSession = Depends(get_db),
) -> Tenant:
    result = await db.execute(select(Tenant).where(Tenant.hostname == hostname))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not configured.",
        )
    return tenant