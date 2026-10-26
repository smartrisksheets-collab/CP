# Migration State

## Current
- Phase: P4 Switch done on dev; merging dev to main
- Gates: P1 VERIFIED | P2 VERIFIED | P3 VERIFIED | P4 PENDING (until main deploys on Render and both tenants pass)
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
After merge: switch Render branch to main, smoke test /tenant on both hostnames, OTP login, one assessment and PDF. Then the migration project is complete. Optional cleanup: update or delete stale backend/render.yaml; trim spaces in ALLOWED_ORIGINS parsing in backend/main.py.

## Last 3 sessions
### 2026-10-25
- P1: Alembic (async env.py, hand written 0001_baseline, raw SQL copy, greenlet pin). Sandbox PostgreSQL 16: upgrade, downgrade -1, upgrade passed; schema identical to create_all.
- P2: removed create_all from backend/main.py and backend/seed.py; seed.py exits with a clear message if migrations have not run. Added compose project name. Sandbox: seed before migrate exits cleanly, migrate then seed twice (idempotent, 3 tenants), app starts in development and production and serves /tenant/localhost.
### 2026-10-26
- P3: session pooler chosen over transaction pooler after sandbox test (D007); pool size from env (D008).
- P3: Supabase schema and seed done (user confirmed tables visible). Added 0002_enable_rls (D009); SQL editor workflow (D010).
### 2026-10-26 (P4)
- Render web service (Pulse_v2 workspace, Frankfurt) on dev: build failed on greenlet until PYTHON_VERSION=3.11.9 was set (D011). /tenant smoke test passed. CORS 400 on OPTIONS fixed by exact ALLOWED_ORIGINS (D012). Login works.
