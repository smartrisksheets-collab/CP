# Session Archive

Older session summaries moved here from state files.

## migration_state.md
### 2026-10-25
- P1: Alembic (async env.py, hand written 0001_baseline, raw SQL copy, greenlet pin). Sandbox PostgreSQL 16: upgrade, downgrade -1, upgrade passed; schema identical to create_all.
- P2: removed create_all from backend/main.py and backend/seed.py; seed.py exits with a clear message if migrations have not run. Added compose project name. Sandbox: seed before migrate exits cleanly, migrate then seed twice (idempotent, 3 tenants), app starts in development and production and serves /tenant/localhost.

## build.md
### 2026-10-25 P1 Alembic baseline
- New: backend/alembic.ini, backend/alembic/env.py, backend/alembic/script.py.mako, backend/alembic/versions/0001_baseline.py, backend/alembic/sql/0001_baseline.sql
- Changed: backend/requirements.txt (greenlet==3.1.1)
- Decisions: D001 to D004

### 2026-10-25 P2 Cutover
- Changed: backend/main.py, backend/seed.py (create_all removed), backend/docker-compose.yml (project name)
- New: build.md, decision.md, migration_state.md, session_archive.md (P1 copies were created but not committed)
- Decisions: D005, D006

### 2026-10-26 P3 Supabase
- Changed: backend/api/db.py (DB_POOL_SIZE, DB_MAX_OVERFLOW)
- Removed: p2-cutover.patch (committed to repo root by mistake)
- Decisions: D007, D008

### 2026-10-26 P3 RLS
- New: backend/alembic/versions/0002_enable_rls.py, backend/alembic/sql/0002_enable_rls.sql
- Decisions: D009, D010

### 2026-10-26 P4 Switch
- New Render web service on dev with Supabase session pooler; env PYTHON_VERSION=3.11.9, exact ALLOWED_ORIGINS
- No code changes
- Decisions: D011, D012

### 2026-10-26 AI model upgrade and cleanups
- Changed: backend/api/claude.py, backend/requirements.txt (anthropic==0.125.0), backend/main.py
- Removed: backend/render.yaml
- Decisions: D013 to D015
