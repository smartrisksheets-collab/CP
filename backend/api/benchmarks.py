"""
Peer medians for the FI ratios (spec: Peer benchmarks; decision D050).

A median is shown only when it is verified against the filed statements, at least
MIN_PEERS companies report the ratio, and its financial year is no more than
MAX_AGE_YEARS older than the issuer's. Peer medians are reference figures: they never
change a score. Rows are loaded by scripts/load_benchmarks.py.
"""
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from api.history import parse_period_end
from api.models import PeerBenchmark

MIN_PEERS     = 5
MAX_AGE_YEARS = 2


def issuer_year(figures: dict) -> int | None:
    end = parse_period_end((figures or {}).get("reportingPeriod"))
    return int(end[:4]) if end else None


def pick_peers(rows: list[dict], year: int | None) -> dict[str, dict]:
    """
    For each ratio, the newest usable median. rows: dicts with ratio_id, fiscal_year,
    peer_group, median, p25, p75, n, source_note, verified.
    """
    best: dict[str, dict] = {}
    for r in rows:
        if not r.get("verified") or (r.get("n") or 0) < MIN_PEERS or r.get("median") is None:
            continue
        if year is not None and r["fiscal_year"] < year - MAX_AGE_YEARS:
            continue
        cur = best.get(r["ratio_id"])
        if cur is None or r["fiscal_year"] > cur["fiscal_year"]:
            best[r["ratio_id"]] = r
    return {
        rid: {"median": r["median"], "p25": r.get("p25"), "p75": r.get("p75"), "n": r["n"],
              "fiscalYear": r["fiscal_year"], "peerGroup": r["peer_group"], "source": r.get("source_note")}
        for rid, r in best.items()
    }


def attach_peers(fi: dict | None, peers: dict[str, dict]) -> dict | None:
    if not fi or fi.get("status") != "ok":
        return fi
    ratios = [{**r, "peer": peers.get(r["id"])} for r in fi["ratios"]]
    groups = sorted({p["peerGroup"] for p in peers.values()})
    return {**fi, "ratios": ratios, "peerGroups": groups}


async def load_peers(db: AsyncSession, sector: str, year: int | None) -> dict[str, dict]:
    result = await db.execute(select(PeerBenchmark).where(and_(
        PeerBenchmark.sector == sector, PeerBenchmark.verified == True,  # noqa: E712
    )))
    rows = [{
        "ratio_id": b.ratio_id, "fiscal_year": b.fiscal_year, "peer_group": b.peer_group,
        "median": b.median, "p25": b.p25, "p75": b.p75, "n": b.n,
        "source_note": b.source_note, "verified": b.verified,
    } for b in result.scalars()]
    return pick_peers(rows, year)
