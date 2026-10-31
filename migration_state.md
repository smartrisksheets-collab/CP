# Migration State

## Current
- Phase: Migration complete (main 741ebb6). Follow-up: AI model upgrade (D013 to D015) delivered
- Gates: P1 VERIFIED | P2 VERIFIED | P3 VERIFIED | P4 VERIFIED (dev merged to main)
- Supabase: Frankfurt (eu-central-1), session pooler aws-1-eu-central-1.pooler.supabase.com:5432
- Render: new web service in workspace Smarkrisk Pulse_v2, Frankfurt
- Head revision: 0003_model_version
- Target: Supabase free tier, empty start (Render DB unreachable, no data copy)
- Local DB: Docker postgres:16, compose project smartrisk-cp, host port 5433

## Next session: read order
1. backend/render.yaml
2. backend/main.py
3. backend/api/db.py

## Next task
Deploy p7 to p9 (model v2.0): run one real assessment per tenant, check rates show as percentages, Trade & Other Payables and the PDF Liquidity group; merge dev to main before 2026-11-30 (claude-sonnet-4-5 retirement).

## Last 3 sessions
### 2026-10-26
- P3: session pooler chosen over transaction pooler after sandbox test (D007); pool size from env (D008).
- P3: Supabase schema and seed done (user confirmed tables visible). Added 0002_enable_rls (D009); SQL editor workflow (D010).
### 2026-10-26 (P4)
- Render web service (Pulse_v2 workspace, Frankfurt) on dev: build failed on greenlet until PYTHON_VERSION=3.11.9 was set (D011). /tenant smoke test passed. CORS 400 on OPTIONS fixed by exact ALLOWED_ORIGINS (D012). Login works.
### 2026-10-26 (follow-up)
- Model upgrade to claude-opus-5-5 (D013), SDK 0.125.0 (D014), cleanups (D015).
- Scoring: finance cost for interest coverage (D016), true DSCR (D017), prompt fixes (D018).
### 2026-10-27
- 0003_model_version: assessments.model_version (TEXT, nullable), backfill v1.0 / v1.1 for complete rows. Sandbox PostgreSQL 16: upgrade, downgrade -1, upgrade passed; backfill checked. SQL run by the user in the Supabase editor before deploy (D010, D021).