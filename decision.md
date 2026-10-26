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
