# Session Archive

Older session summaries moved here from state files.

## migration_state.md
### 2026-10-25
- P1: Alembic (async env.py, hand written 0001_baseline, raw SQL copy, greenlet pin). Sandbox PostgreSQL 16: upgrade, downgrade -1, upgrade passed; schema identical to create_all.
- P2: removed create_all from backend/main.py and backend/seed.py; seed.py exits with a clear message if migrations have not run. Added compose project name. Sandbox: seed before migrate exits cleanly, migrate then seed twice (idempotent, 3 tenants), app starts in development and production and serves /tenant/localhost.
