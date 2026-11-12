"""
Issuer history storage: load an issuer's confirmed periods and save new ones after a run.
Everything is scoped to one tenant; one tenant never sees another tenant's issuers.
"""
import logging
from datetime import date, datetime, timezone

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.history import normalise_rc
from api.models import Issuer, IssuerPeriod

log = logging.getLogger(__name__)


def _period_dict(row: IssuerPeriod) -> dict:
    return {
        "periodEnd"   : row.period_end.isoformat(),
        "periodMonths": row.period_months,
        "audited"     : row.audited,
        "basis"       : row.basis,
        "figures"     : row.figures or {},
        "docPeriodEnd": row.doc_period_end.isoformat(),
        "source"      : "stored",
        "oneOff"      : row.one_off,
        "storedFromAssessment": row.assessment_id,
    }


async def find_issuer(db: AsyncSession, tenant_id: int, rc_number) -> Issuer | None:
    rc = normalise_rc(rc_number)
    if not rc:
        return None
    result = await db.execute(select(Issuer).where(and_(Issuer.tenant_id == tenant_id, Issuer.rc_number == rc)))
    return result.scalar_one_or_none()


async def load_periods(db: AsyncSession, tenant_id: int, rc_number) -> tuple[Issuer | None, list[dict]]:
    issuer = await find_issuer(db, tenant_id, rc_number)
    if not issuer:
        return None, []
    result = await db.execute(
        select(IssuerPeriod)
        .where(and_(IssuerPeriod.issuer_id == issuer.id, IssuerPeriod.tenant_id == tenant_id))
        .order_by(IssuerPeriod.period_end.desc())
    )
    return issuer, [_period_dict(r) for r in result.scalars().all()]


async def save_periods(db: AsyncSession, tenant_id: int, rc_number, name: str | None,
                       periods: list[dict], assessment_id: int | None) -> int:
    """
    Upsert the issuer and its periods. A period is replaced only by figures from a document
    at least as new as the one it came from (or by the analyst-reviewed current statement);
    the replaced figures are kept in previous_figures. Returns the number of rows written.
    """
    rc = normalise_rc(rc_number)
    if not rc or not periods:
        return 0
    now = datetime.now(timezone.utc)

    issuer = await find_issuer(db, tenant_id, rc)
    if issuer is None:
        issuer = Issuer(tenant_id=tenant_id, rc_number=rc, name=name)
        db.add(issuer)
        await db.flush()
    elif name and issuer.name != name:
        issuer.name, issuer.updated_at = name, now

    written = 0
    for p in periods:
        end, doc_end = date.fromisoformat(p["periodEnd"]), date.fromisoformat(p["docPeriodEnd"])
        months = int(p.get("periodMonths") or 12)
        result = await db.execute(select(IssuerPeriod).where(and_(
            IssuerPeriod.issuer_id == issuer.id, IssuerPeriod.period_end == end,
            IssuerPeriod.period_months == months,
        )))
        row = result.scalar_one_or_none()
        figures = {k: v for k, v in (p.get("figures") or {}).items() if v is not None}
        one_off = p.get("oneOff") if (p.get("oneOff") or {}).get("amount") else None

        if row is None:
            db.add(IssuerPeriod(
                tenant_id=tenant_id, issuer_id=issuer.id, period_end=end, period_months=months,
                audited=p.get("audited"), basis=p.get("basis"), figures=figures, doc_period_end=doc_end,
                source=p.get("source") or "upload", one_off=one_off, assessment_id=assessment_id,
            ))
            written += 1
            continue

        newer = p.get("source") == "current" or doc_end >= row.doc_period_end
        changed = figures != (row.figures or {}) or one_off != row.one_off or p.get("audited") != row.audited
        if not (newer and changed):
            continue
        if figures != (row.figures or {}):
            row.previous_figures = row.figures
        row.figures, row.one_off, row.audited = figures, one_off, p.get("audited")
        row.basis = p.get("basis") or row.basis
        row.doc_period_end = max(doc_end, row.doc_period_end)
        if p.get("source") != "stored":
            row.source = p.get("source") or row.source
        row.assessment_id, row.updated_at = assessment_id, now
        written += 1

    await db.commit()
    return written
