# Build Log

## 2026-10-25 P1 Alembic baseline
- New: backend/alembic.ini, backend/alembic/env.py, backend/alembic/script.py.mako, backend/alembic/versions/0001_baseline.py, backend/alembic/sql/0001_baseline.sql
- Changed: backend/requirements.txt (greenlet==3.1.1)
- Decisions: D001 to D004

## 2026-10-25 P2 Cutover
- Changed: backend/main.py, backend/seed.py (create_all removed), backend/docker-compose.yml (project name)
- New: build.md, decision.md, migration_state.md, session_archive.md (root files skipped from P1 because the patch was applied from backend/)
- Decisions: D005, D006
