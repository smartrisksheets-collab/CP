# Migration State

## Current
- Phase: P2 Cutover (delivered, awaiting user apply and push to dev)
- Gates: P1 VERIFIED (on dev, 0001_baseline at head locally) | P2 PENDING | P3 LOCKED | P4 LOCKED
- Head revision: 0001_baseline
- Target: Supabase free tier, empty start (Render DB unreachable, no data copy)
- Local DB: Docker postgres:16, compose project smartrisk-cp, host port 5433

## Next session: read order
1. backend/api/db.py (engine pool settings)
2. backend/alembic/env.py
3. backend/render.yaml

## Next task
P3 Supabase: create project, set MIGRATION_DATABASE_URL (session/direct) and DATABASE_URL (transaction pooler), disable asyncpg statement caching for the pooler, size pool to the plan limit, run alembic upgrade head and seed.py against Supabase.

## Last 3 sessions
### 2026-10-25
- P1: Alembic (async env.py, hand written 0001_baseline, raw SQL copy, greenlet pin). Sandbox PostgreSQL 16: upgrade, downgrade -1, upgrade passed; schema identical to create_all.
- P2: removed create_all from backend/main.py and backend/seed.py; seed.py exits with a clear message if migrations have not run. Added compose project name. Sandbox: seed before migrate exits cleanly, migrate then seed twice (idempotent, 3 tenants), app starts in development and production and serves /tenant/localhost.
