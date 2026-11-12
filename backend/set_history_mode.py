"""
Switch issuer history on or off for one tenant (D036), without the Supabase dashboard.

Run from the backend folder, for example in the Render Shell:
    python set_history_mode.py assess.smartrisksheets.com shadow
    python set_history_mode.py assess.smartrisksheets.com off
    python set_history_mode.py --list
"""
import asyncio
import sys

from sqlalchemy import select

from api.db import SessionLocal
from api.history import MODES
from api.models import Tenant


async def main(argv: list[str]) -> int:
    async with SessionLocal() as db:
        if argv == ["--list"]:
            for t in (await db.execute(select(Tenant).order_by(Tenant.id))).scalars():
                print(f"{t.hostname}: {t.history_mode}")
            return 0
        if len(argv) != 2 or argv[1] not in MODES:
            print(__doc__.strip())
            print(f"Modes: {', '.join(MODES)}")
            return 2
        hostname, mode = argv
        tenant = (await db.execute(select(Tenant).where(Tenant.hostname == hostname))).scalar_one_or_none()
        if not tenant:
            print(f"No tenant with hostname {hostname}. Use --list to see them.")
            return 1
        before, tenant.history_mode = tenant.history_mode, mode
        await db.commit()
        print(f"{hostname}: history_mode {before} -> {mode}")
        return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main(sys.argv[1:])))
