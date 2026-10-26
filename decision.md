# Decision Log

## Index
- D001 2026-10-25 Start Supabase empty, no data migration from Render
- D002 2026-10-25 Alembic env.py is async and reads MIGRATION_DATABASE_URL, then DATABASE_URL
- D003 2026-10-25 Baseline revision mirrors create_all output exactly
- D004 2026-10-25 Pin greenlet in requirements.txt
- D005 2026-10-25 Local database is Docker Postgres 16 on port 5433, never SQLite
- D006 2026-10-25 Alembic is the only schema source; app and seed never create tables
- D007 2026-10-26 App and Alembic both use the Supabase session pooler, not the transaction pooler
- D008 2026-10-26 DB pool size set by DB_POOL_SIZE and DB_MAX_OVERFLOW, default 5 and 5
- D009 2026-10-26 RLS enabled on every table with no policies (0002_enable_rls)
- D010 2026-10-26 Supabase schema changes are run by the user as SQL in the editor
- D011 2026-10-26 Render pins Python with PYTHON_VERSION=3.11.9
- D012 2026-10-26 ALLOWED_ORIGINS must match browser origins exactly
- D013 2026-10-26 Replace claude-sonnet-4-5 (retires 2026-11-30) with claude-opus-5-5 at effort medium
- D014 2026-10-26 anthropic SDK 0.40.0 to 0.125.0 (last 0.x)
- D015 2026-10-26 ALLOWED_ORIGINS trimmed in code; backend/render.yaml removed
- D016 2026-10-26 Interest coverage uses reported finance cost; debt x rates only as fallback
- D017 2026-10-26 DSCR = EBITDA / (finance cost + short-term debt), higher is better
- D018 2026-10-26 Extraction prompt: year-neutral columns; CP, bonds and overdrafts count as debt

## D001 Start Supabase empty
Render database is suspended for non-payment and unreachable. User confirmed the app stores no data worth keeping. Tenants are recreated by backend/seed.py. Edge cases: no stamping of an existing schema needed; tenant rows must exist before any login, so seed runs after upgrade head.

## D002 Async env.py with MIGRATION_DATABASE_URL
The app engine is asyncpg, so env.py uses create_async_engine with NullPool and the same URL format. MIGRATION_DATABASE_URL lets migrations use Supabase's direct or session connection while the app uses the transaction pooler. Edge cases: missing URL raises a clear error; offline mode (--sql) produces raw SQL for the Supabase SQL editor.

## D003 Baseline mirrors create_all
0001_baseline was hand written and verified by diffing pg_dump of create_all against alembic upgrade head and against the raw SQL file: identical. Python side defaults (default=) stay in the models, not server defaults, matching create_all. Edge case: inserts made outside the app (SQL editor) must supply those columns.

## D004 Pin greenlet
SQLAlchemy async needs greenlet; SQLAlchemy 2.0.36 only pulls it in automatically on some Python versions and platforms. The sandbox on Python 3.13 failed without it. Pinned greenlet==3.1.1, tested.

## D005 Local Docker Postgres 16 on 5433
Models use JSONB and ARRAY and the engine is asyncpg, so SQLite cannot run the app. backend/docker-compose.yml runs postgres:16 with compose project name smartrisk-cp (keeps volumes apart from other projects such as SmartRisk Pulse) on host port 5433, because a native Windows Postgres already listens on 5432.

## D006 Alembic is the only schema source
create_all removed from backend/main.py lifespan and backend/seed.py. Migrations run explicitly with alembic upgrade head; they are not run on app startup, so several workers never race on DDL. Edge cases: seed.py on an unmigrated database exits with "Schema missing. Run: alembic upgrade head"; seed stays idempotent (update by hostname); production startup unchanged apart from no DDL.

## D007 Session pooler for app and Alembic
Render runs a persistent FastAPI server, which matches Supabase's session pooler (port 5432 on aws-1-eu-central-1.pooler.supabase.com, IPv4). The transaction pooler (6543) was tested in the sandbox through PgBouncer in transaction mode: 130 of 200 concurrent queries failed with "prepared statement does not exist", even with asyncpg statement_cache_size=0 and unique statement names. Session mode: 0 of 200 failed. Edge cases: Supabase direct connection not used (IPv6); MIGRATION_DATABASE_URL may equal DATABASE_URL; Supavisor itself could not be tested in the sandbox.

## D008 Pool size from environment
backend/api/db.py had pool_size 10 plus max_overflow 20 (30 connections per worker), too many for a free tier session pool. Now DB_POOL_SIZE (default 5) and DB_MAX_OVERFLOW (default 5). Edge case: total across workers must stay under the pool size shown in Supabase Database settings.
Pool math (Supabase Nano, pool size 15): one uvicorn worker uses at most 10, Alembic 1. With 2 workers set DB_POOL_SIZE=3 and DB_MAX_OVERFLOW=3.

## D009 RLS on, no policies
Supabase exposes the public schema through its Data API to the anon and authenticated roles. RLS with no policies denies them every row. The app connects as the owner role, which RLS does not apply to, so app behaviour is unchanged. Sandbox: as a non-superuser owner, seed and app worked and 200 concurrent queries passed; a separate role with table grants saw 0 tenants and its insert was rejected by RLS. Edge case: FORCE ROW LEVEL SECURITY must never be added, or the app would be blocked too. alembic_version also gets RLS.

## D010 SQL editor workflow
Each migration still gets an Alembic revision (keeps local Docker and alembic_version consistent) plus backend/alembic/sql/<revision>.sql produced with alembic upgrade --sql, which includes the alembic_version update. The user runs that SQL in the Supabase SQL editor. The revision file must be pushed in the same change, otherwise alembic upgrade head on Render fails with "Can't locate revision".

## D011 PYTHON_VERSION on Render
Render's default Python had no prebuilt greenlet 3.1.1 wheel, so the build failed. PYTHON_VERSION=3.11.9 (matches backend/runtime.txt and the previous production runtime) fixed it. Pinning Python is safer than bumping greenlet alone, since asyncpg and weasyprint pins also target 3.11.

## D012 Exact CORS origins
backend/main.py splits ALLOWED_ORIGINS on commas with no trimming, so a space, trailing slash or wrong scheme makes the browser preflight (OPTIONS) return 400. Value used: https://assess.smartrisksheets.com,https://credit.smartrisksheets.com.

## D013 Claude Opus 5.5 at effort medium
claude-sonnet-4-5 is deprecated and retires 2026-11-30; every AI step (figures, rating, CP terms, narrative) goes through backend/api/claude.py. User chose Opus 5.5 over Sonnet 5.5 for accuracy. Thinking is always on, so: effort set to medium to limit cost (user choice, no real-PDF comparison run; raise to high if figures are missed), max_tokens 2000 to 16000, response read by block type (first block can be thinking), timeout 150 to 300 s. fallbacks="default" (beta server-side-fallback-2026-07-01) re-runs a safety-declined request on a fallback model. Edge cases handled with clear errors: refusal, max_tokens cut-off, empty text. Tested offline against a mocked API only. Real-PDF quality not compared (no sample PDFs available); the analyst review step (ReviewData) is the safety net for the first live assessments.

## D014 SDK 0.125.0
0.40.0 predates output_config, thinking blocks and fallbacks. 0.125.0 is the last 0.x release, so it avoids the 1.x httpx to httpx2 change; it installs alongside the existing httpx==0.27.0 pin (pip check clean).

## D015 Cleanups
backend/main.py strips spaces and trailing slashes from ALLOWED_ORIGINS (tested: padded list accepted, unknown origin still 400). backend/render.yaml deleted: Render only reads it from the repo root and it no longer matched the real service.

## D016 Finance cost for interest coverage
Checked on Veritasi AFS FYE 2025: reported finance cost 2,858,152k (Note 12) gives EBIT 5,412,743 / 2,858,152 = 1.89x; the old debt x assumed-rate estimate gave 1.41x. Reported cost is audited and repeatable; rates from notes are often ranges. New extracted field financeCost (editable in ReviewData). Same rule in backend/api/scoring.py, backend/api/report.py, frontend Scores.jsx preview and the narrative. Edge cases: negative value taken as absolute; missing value falls back to rates; capitalised borrowing costs (IAS 23) can make reported cost understate true interest.

## D017 True DSCR
Old DSCR was EBITDA / total debt with low values scoring highest, contradicting its own ">= 1.5x" benchmark (inherited from the Apps Script; AppPage.jsx called it "inverted by design" on a misreading). User chose: EBITDA / (finance cost + short-term debt incl. CP and overdrafts), bands >= 1.5x = 7, 1.25 to 1.49x = 5, 1.0 to 1.24x = 3, < 1.0x = 0. No debt at all = 7 ("No debt"); debt but no cost and no short-term debt = N/A, 0. Veritasi: 0.44x, 0 points (was 7). Scores differ from reports made before this change; client to be informed.

## D018 Extraction prompt fixes
Prompt hardcoded "COMPANY 2024 / 2023" columns, wrong for FYE 2025 statements; now "current year / prior year". Debt now explicitly includes commercial papers, bonds, notes, overdrafts and finance leases, and the model must open the notes behind "Other liabilities" lines. Reason: Sonnet 4.5 missed 17.2bn (CP 7.2bn, bond 10bn) on Veritasi; Opus 5.5 found them, the prompt now asks for it explicitly.
