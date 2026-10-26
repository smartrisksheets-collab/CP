# Build Log

## 2026-10-25 P1 Alembic baseline
- New: backend/alembic.ini, backend/alembic/env.py, backend/alembic/script.py.mako, backend/alembic/versions/0001_baseline.py, backend/alembic/sql/0001_baseline.sql
- Changed: backend/requirements.txt (greenlet==3.1.1)
- Decisions: D001 to D004

## 2026-10-25 P2 Cutover
- Changed: backend/main.py, backend/seed.py (create_all removed), backend/docker-compose.yml (project name)
- New: build.md, decision.md, migration_state.md, session_archive.md (P1 copies were created but not committed)
- Decisions: D005, D006

## 2026-10-26 P3 Supabase
- Changed: backend/api/db.py (DB_POOL_SIZE, DB_MAX_OVERFLOW)
- Removed: p2-cutover.patch (committed to repo root by mistake)
- Decisions: D007, D008

## 2026-10-26 P3 RLS
- New: backend/alembic/versions/0002_enable_rls.py, backend/alembic/sql/0002_enable_rls.sql
- Decisions: D009, D010

## 2026-10-26 P4 Switch
- New Render web service on dev with Supabase session pooler; env PYTHON_VERSION=3.11.9, exact ALLOWED_ORIGINS
- No code changes
- Decisions: D011, D012

## 2026-10-26 AI model upgrade and cleanups
- Changed: backend/api/claude.py, backend/requirements.txt (anthropic==0.125.0), backend/main.py
- Removed: backend/render.yaml
- Decisions: D013 to D015

## 2026-10-26 Scoring fixes
- Changed: backend/api/scoring.py, backend/api/report.py, backend/api/claude.py (prompt, narrative DSCR), frontend/src/components/steps/Scores.jsx, ReviewData.jsx, frontend/src/pages/AppPage.jsx
- Checks: Veritasi figures give ICR 1.89x (4 pts), DSCR 0.44x (0 pts); edge cases (no debt, negative cost, missing cost, negative EBITDA, string values) pass; npm run build passes; no new lint issues (18 pre-existing); app starts
- Decisions: D016 to D018
