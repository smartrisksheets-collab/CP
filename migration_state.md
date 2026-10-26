# Migration State

## Current
- Phase: P3 Supabase (schema and seed on Supabase confirmed by user; 0002_enable_rls delivered)
- Gates: P1 VERIFIED | P2 VERIFIED | P3 PENDING (until 0002 is on dev and run in the SQL editor) | P4 LOCKED
- Supabase: Frankfurt (eu-central-1), session pooler aws-1-eu-central-1.pooler.supabase.com:5432
- Render: new web service in workspace Smarkrisk Pulse_v2, Frankfurt
- Head revision: 0002_enable_rls
- Target: Supabase free tier, empty start (Render DB unreachable, no data copy)
- Local DB: Docker postgres:16, compose project smartrisk-cp, host port 5433

## Next session: read order
1. backend/render.yaml
2. backend/main.py
3. backend/api/db.py

## Next task
P4 Switch: create Render web service (Python 3, root backend, start alembic upgrade head && uvicorn), set env vars incl. DATABASE_URL (session pooler) and DB_POOL_SIZE, merge dev to main, smoke test both tenants.

## Last 3 sessions
### 2026-10-25
- P1: Alembic (async env.py, hand written 0001_baseline, raw SQL copy, greenlet pin). Sandbox PostgreSQL 16: upgrade, downgrade -1, upgrade passed; schema identical to create_all.
- P2: removed create_all from backend/main.py and backend/seed.py; seed.py exits with a clear message if migrations have not run. Added compose project name. Sandbox: seed before migrate exits cleanly, migrate then seed twice (idempotent, 3 tenants), app starts in development and production and serves /tenant/localhost.
### 2026-10-26
- P3: session pooler chosen over transaction pooler after sandbox test (D007); pool size from env (D008).
- P3: Supabase schema and seed done (user confirmed tables visible). Added 0002_enable_rls (D009); SQL editor workflow (D010).
