from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from api.db import SessionLocal
from api.models import Tenant
from api.deps import get_db

router = APIRouter()


@router.get("/{hostname}")
async def get_tenant(hostname: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tenant).where(Tenant.hostname == hostname))
    tenant = result.scalar_one_or_none()

    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not configured.",
        )

    return {
        "clientName"   : tenant.client_name,
        "logoUrl"      : tenant.logo_url,
        "primaryColor" : tenant.primary_color,
        "primaryHover" : tenant.primary_hover,
        "accentColor"  : tenant.accent_color,
        "accentHover"  : tenant.accent_hover,
        "accentRgb"    : tenant.accent_rgb,
        "loginEyebrow" : tenant.login_eyebrow,
        "loginSubtext" : tenant.login_subtext,
        "adminEmail"   : tenant.admin_email,
        "requiresCode" : tenant.access_code is not None,  # never expose the actual code
    }