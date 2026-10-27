r"""Back-test scoring models on every saved assessment. Read-only.

Re-scores the saved figures of each complete assessment under two model versions
and lists the ones whose eligibility differs. Nothing is written to the database.

Usage (PowerShell, from backend\ with the venv active and DATABASE_URL set):
    python -m scripts.backtest_models                 # v1.2 vs v2.0
    python -m scripts.backtest_models v1.2 v2.0 out.csv
"""
import asyncio
import csv
import os
import sys

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from api.scoring import MODELS, compute_all_ratios

QUERY = text("""
    SELECT id, tenant_id, client_name, total_score, eligible, model_version, figures
    FROM assessments
    WHERE status = 'complete' AND deleted_at IS NULL AND figures IS NOT NULL
    ORDER BY id
""")


async def main(old: str, new: str, out_path: str) -> None:
    for v in (old, new):
        if v not in MODELS:
            sys.exit(f"Unknown model {v}. Known: {', '.join(MODELS)}")

    engine = create_async_engine(os.environ["DATABASE_URL"])
    async with engine.connect() as conn:
        await conn.execute(text("SET TRANSACTION READ ONLY"))
        rows = (await conn.execute(QUERY)).mappings().all()
    await engine.dispose()

    flips = 0
    with open(out_path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["id", "tenant_id", "client", "stored_version", "stored_score", "stored_eligible",
                    f"{old}_score", f"{old}_eligible", f"{new}_score", f"{new}_eligible", "eligibility_changes"])
        for r in rows:
            a = compute_all_ratios(r["figures"], old)
            b = compute_all_ratios(r["figures"], new)
            changed = a["eligible"] != b["eligible"]
            flips += changed
            w.writerow([r["id"], r["tenant_id"], r["client_name"], r["model_version"], r["total_score"],
                        r["eligible"], a["total_score"], a["eligible"], b["total_score"], b["eligible"],
                        "YES" if changed else ""])

    print(f"{len(rows)} assessments re-scored, {flips} change eligibility between {old} and {new}.")
    print(f"Full list: {out_path}")


if __name__ == "__main__":
    args = sys.argv[1:]
    asyncio.run(main(
        args[0] if len(args) > 0 else "v1.2",
        args[1] if len(args) > 1 else "v2.0",
        args[2] if len(args) > 2 else "backtest.csv",
    ))
