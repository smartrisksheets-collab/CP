"""
Load peer medians for the FI ratios from a per-company CSV (D050), and mark them verified.

The CSV has one row per company and ratio: company, ticker, ratio_id, value, source_url, note.
Each ratio's median, 25th and 75th percentile and n are worked out here and stored with the
company values. Loaded rows are NOT verified, so the app does not show them. Mark a year
verified only after every value has been checked against the filed audited statements.

Run from the backend folder, for example in the Render Shell:
    python -m scripts.load_benchmarks load data/peer_data_fy2025_banks.csv --year 2025
    python -m scripts.load_benchmarks verify --year 2025
    python -m scripts.load_benchmarks list
Options: --sector (default financial_services), --group (default "NGX-listed banks").
"""
import argparse
import asyncio
import csv
import statistics
import sys
from collections import defaultdict
from datetime import datetime, timezone

from sqlalchemy import and_, select

from api.db import SessionLocal
from api.fi import FI_SPECS, SECTOR_CODES
from api.models import PeerBenchmark

RATIO_IDS = {rid for rid, *_ in FI_SPECS}


def summarise(rows: list[dict]) -> dict[str, dict]:
    """ratio_id -> {median, p25, p75, n, values}. Raises ValueError on an unknown ratio or a bad value."""
    by_ratio: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        rid = (r.get("ratio_id") or "").strip()
        if rid not in RATIO_IDS:
            raise ValueError(f"Unknown ratio_id {rid!r} for {r.get('company')}")
        try:
            value = float(r["value"])
        except (TypeError, ValueError):
            raise ValueError(f"Bad value {r.get('value')!r} for {r.get('company')} {rid}")
        by_ratio[rid].append({"company": r.get("company"), "ticker": r.get("ticker"), "value": value,
                              "source": r.get("source_url"), "note": r.get("note") or None})
    out = {}
    for rid, items in by_ratio.items():
        vals = sorted(i["value"] for i in items)
        q = statistics.quantiles(vals, n=4, method="inclusive") if len(vals) >= 2 else [vals[0]] * 3
        out[rid] = {"median": statistics.median(vals), "p25": q[0], "p75": q[2], "n": len(vals), "values": items}
    return out


async def load(path: str, sector: str, year: int, group: str) -> int:
    with open(path, newline="", encoding="utf-8") as fh:
        summary = summarise(list(csv.DictReader(fh)))
    async with SessionLocal() as db:
        for rid, s in summary.items():
            row = (await db.execute(select(PeerBenchmark).where(and_(
                PeerBenchmark.sector == sector, PeerBenchmark.ratio_id == rid,
                PeerBenchmark.fiscal_year == year, PeerBenchmark.peer_group == group,
            )))).scalar_one_or_none()
            if row is None:
                row = PeerBenchmark(sector=sector, ratio_id=rid, fiscal_year=year, peer_group=group)
                db.add(row)
            row.median, row.p25, row.p75, row.n = s["median"], s["p25"], s["p75"], s["n"]
            row.company_values = s["values"]
            row.source_note = f"{group}, FY{year}; company sources in company_values"
            row.verified, row.verified_at = False, None  # new figures need checking again
            print(f"{rid}: median {s['median']:.2f} (n={s['n']}) loaded, not verified")
        await db.commit()
    return 0


async def verify(sector: str, year: int, group: str) -> int:
    async with SessionLocal() as db:
        rows = (await db.execute(select(PeerBenchmark).where(and_(
            PeerBenchmark.sector == sector, PeerBenchmark.fiscal_year == year, PeerBenchmark.peer_group == group,
        )))).scalars().all()
        if not rows:
            print("Nothing to verify. Load the CSV first.")
            return 1
        now = datetime.now(timezone.utc)
        for row in rows:
            row.verified, row.verified_at = True, now
        await db.commit()
        print(f"{len(rows)} medians verified for {group}, FY{year}. They now show for tenants with fi_mode on.")
    return 0


async def show() -> int:
    async with SessionLocal() as db:
        for b in (await db.execute(select(PeerBenchmark).order_by(
                PeerBenchmark.sector, PeerBenchmark.fiscal_year, PeerBenchmark.ratio_id))).scalars():
            print(f"{b.sector} FY{b.fiscal_year} {b.peer_group} {b.ratio_id}: median {b.median:.2f} "
                  f"n={b.n} {'verified' if b.verified else 'NOT verified'}")
    return 0


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("action", choices=("load", "verify", "list"))
    p.add_argument("csv", nargs="?")
    p.add_argument("--year", type=int)
    p.add_argument("--sector", default="financial_services")
    p.add_argument("--group", default="NGX-listed banks")
    a = p.parse_args(argv)
    if a.sector not in SECTOR_CODES:
        p.error(f"unknown sector {a.sector}")
    if a.action == "list":
        return asyncio.run(show())
    if a.year is None:
        p.error("--year is required")
    if a.action == "load":
        if not a.csv:
            p.error("load needs the CSV path")
        return asyncio.run(load(a.csv, a.sector, a.year, a.group))
    return asyncio.run(verify(a.sector, a.year, a.group))


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
