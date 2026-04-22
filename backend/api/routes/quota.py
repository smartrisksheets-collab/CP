from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from api.deps import get_db, get_current_user
from api.models import User

router = APIRouter()


@router.get("/status")
async def quota_status(
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
        "plan"    : user.plan,
        "credits" : user.credits,
        "allowed" : user.credits > 0,
    }