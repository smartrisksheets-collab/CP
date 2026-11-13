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
- D019 2026-10-27 Keep true DSCR (D017) instead of spec item 5 EBITDA / Total Debt
- D020 2026-10-27 Score preview comes from the server engine (/assessment/preview); frontend copy removed
- D021 2026-10-27 Scoring bands are versioned tables in scoring.py; assessments.model_version (0003)
- D022 2026-10-27 Interest rates are always percentages, marked by figures.rateUnit
- D023 2026-10-27 Go live with model v2.0 (Liquidity 2 to 8 points, total 56, cutoff 34)
- D024 2026-10-31 Uploads take one PDF or up to 20 photos per slot; file type read from bytes
- D025 2026-10-31 Every file is checked before a credit is charged; failed extraction refunds it
- D026 2026-10-31 Keyword and client-name checks warn, never block; only unprocessable files are blocked
- D027 2026-10-31 Keyword matching normalised (NFKC, spacing, apostrophes); financial check reads 100 pages
- D028 2026-10-31 One errorMessage helper for API errors, offline banner, CORS kept on unhandled 500s
- D029 2026-10-31 Client timeouts: extract 600s, CP extract 330s
- D030 2026-11-02 Personal emails register only via a per-tenant admin allowlist (email_allowlist, 0004)
- D031 2026-11-02 Revoke blocks access immediately; only a revoked entry blocks, legacy accounts unaffected
- D032 2026-11-02 /auth/me returns role; AuthContext falls back to the cached user on non-401 errors
- D033 2026-11-09 Sign out after 60 minutes of inactivity, enforced in the browser, shared across tabs
- D034 2026-11-09 Client checks JWT exp; 401 signs out only on requests that carried a token; login page shows the reason
- D035 2026-11-09 Pricing and payment callback call the API through the shared api client
- D036 2026-11-12 Issuer history behind tenants.history_mode, off by default
- D037 2026-11-12 Phase 1 is shadow mode: history adjustment calculated and saved, never added to the score
- D038 2026-11-12 Trend uses the model's own ratios; bands and caps are starting values for the back-test
- D039 2026-11-12 Separate multi-period extraction, run in parallel on every document, one credit
- D040 2026-11-12 One record per period: current statement wins its year, then audited, then newest document
- D041 2026-11-12 Issuer history stored per tenant by RC number, only after a completed run
- D042 2026-11-12 Half-year interim is an early warning only; a triggered check needs an analyst comment
- D043 2026-11-12 One-off items leave the trend only and need a reason
- D044 2026-11-12 Report: two scorecard tiles, a Historical Performance section and a footer note
- D045 2026-11-12 Stay on the 512MB Render instance: 30MB cap on history files, two history reads at a time
- D046 2026-11-12 PDF only (replaces D024's photos); two audited statements on Upload, the older-statement box removed
- D047 2026-11-12 Band labels and benchmarks made exact; no score changes
- D048 2026-11-12 Model v2.1: Acid-Test full marks above 1.0x
- D049 2026-11-12 Score table: Benchmark | Result | Band | Score, amber for partial scores, model version under the total

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

## D019 Keep true DSCR
Eddu's spec (item 5) proposed EBITDA / Total Debt with reversed bands. That is a leverage ratio already covered by Net Debt / EBITDA, Debt to Asset and Debt to Capital, and D017 is close to the spec's own "full fix" (EBITDA / (interest + principal due in 12 months)) using short-term debt as the principal. Eddu agreed. Effect: Streadvest DSCR 6.60x, full points.

## D020 Server-side score preview
The Scores step had a JavaScript copy of the engine that already disagreed with the server (Net Debt / EBITDA above 4.0x: -5 vs 0). Replaced by POST /assessment/preview (auth, 30/minute, no AI, no credit, no save). Ratio tables in Scores, Result and Dashboard now share frontend/src/components/RatioTable.jsx. PDF header and AI narrative read the saved ratios; old assessments fall back to the engine. Edge cases: preview failure shows a message and the run still works; display-only ratios never enter the total.

## D021 Versioned band tables
backend/api/scoring.py keeps one band table per model (v1.2, v2.0); MODEL_VERSION selects the live one; each model must total 56 at import; cutoff = ceil(max x 60%). Every saved assessment stores model_version (0003_model_version, backfill v1.1 if ratios hold current_ratio, else v1.0; drafts stay NULL). Old reports keep their stored scores; re-running a draft uses the live model. backend/scripts/backtest_models.py re-scores saved figures under two models in a read-only transaction. Also: acid-test uses current assets (item 4), EBITDA <= 0 scores 0 on Net Debt / EBITDA (item 6), no debt scores full interest coverage (item 7), Altman Z' private-firm formula (item 8).

## D022 Rates as percentages
Old rule (rate > 1 means percent) read 0.8% as 80%. Extraction now returns 21.5 for 21.5%, figures carry rateUnit "percent" and the engine divides by 100. Figures without rateUnit (older drafts and assessments) are converted once with the old rule by normalise_rates. Review Data rejects rates outside 0 to 100. Edge case: an extracted rate below 1% without rateUnit would be read as a decimal; not realistic for Nigerian borrowing.

## D023 Model v2.0 live
User chose to go live with v2.0 on 2026-10-27: Liquidity 8 (Acid-Test 2, Current 3, Cash 3), Coverage 16 (Interest Coverage 6, DSCR 5, Net Debt / EBITDA 5), Altman Z' 8, others unchanged. DSCR 5-point bands: >= 1.5x 5, 1.25 to 1.49x 3, 1.0 to 1.24x 2, < 1.0x 0, no debt 5. Streadvest: 53/56. Back-test against Supabase recommended before deploy (Supabase started empty on 2026-10-26).

## D024 Photo and scanned uploads
Claude reads PDF pages as images, so scans need no text layer; the old frontend text checks were the only blocker. Each slot takes one PDF or up to 20 JPG, PNG or WebP photos (form field names unchanged). backend/api/documents.py sniffs bytes, not names. The browser applies EXIF rotation and downscales photos to 2576px JPEG (the model's full-detail size, under the API's 5MB image limit), dedupes repeats and orders pages by file name. Edge cases: HEIC, mixed PDF and photos, several PDFs, empty files, renamed files, over 20MB per slot, 21+ photos; all rejected with a message.

## D025 Validate before charging, refund on failure
/assessment/extract checked files after charging and rating or CP files after extraction, so a bad file lost a credit. All files are now checked first. Any extraction failure (including unreadable AI JSON, previously a 500) refunds the credit and sets the usage row's status to refunded; the /run back-fill skips refunded rows. No migration: status already allowed refunded.

## D026 Content checks warn, never block
Text layers are unreliable (spacing, OCR, ligatures, unusual wording, statements after page 100), the AI reads the whole document and the user reviews every figure, so a false rejection costs more than a warning. Hard blocks remain for locked, damaged, empty, wrong type, too large, over 600 pages. Confirm-before-credit step unchanged.

## D027 Keyword normalisation
UNA 2025 statements were rejected because pdf.js text had 19,324 double spaces. matchText() applies NFKC, removes apostrophes, turns , ; : into spaces and collapses whitespace on both text and keywords. Financial check reads up to 100 pages (statements were on page 31).

## D028 Error messages
Screens showed detail or a fixed line, so offline, timeouts and Render's own 503 page never said to check the connection, and 422 (list) or 402 (object) details could crash React. errorMessage(err, fallback) in frontend/src/api/client.js: offline first, then no response, then the server's string or detail.message, then by status. The interceptor parses JSON errors from blob downloads. backend/main.py middleware sits inside CORSMiddleware so unhandled 500s return JSON with CORS headers (verified missing before).

## D029 Client timeouts
Extract 120s to 600s and CP extract 90s to 330s, because one AI call may take 300s and a client timeout still charges. Backend worst case (3 x 300s) can exceed 600s; Render's request limit is unknown.

## D030 Personal email allowlist
Admins needed to let specific Gmail, Yahoo and similar test users register. New table email_allowlist (tenant_id, email, note, added_by, created_at, revoked_at, revoked_by), unique per tenant and email, RLS on, one row per email: revoke sets revoked_at, re-adding clears it. Only personal domains can be added; disposable stay blocked. Emails normalised as at registration (lowercase, trimmed, + alias dropped). Admin and superadmin manage the tenant they are logged into, like every admin route. Tenant.allowed_emails and auth._is_allowed are unused legacy, left untouched. Edge cases: empty or malformed or work email (400), duplicate active (409), concurrent add (IntegrityError to 409), revoke unknown (404) or twice (409), revoke between register and verify-email (verify refused), tenant isolation, role user (403), mixed case and + aliases.

## D031 Revoke blocks access immediately
User chose block over registration-only. get_current_user returns 401 (frontend already signs out on 401); request-otp and verify-otp return 403 with "Your access has been revoked". Account and assessments kept; re-adding restores access. Only a revoked entry blocks, so personal-domain accounts created before this change with no entry keep working. Admins cannot revoke their own email; only a superadmin can revoke a superadmin; revoked users cannot be made admin. Extra cost: one indexed lookup per request, only for personal-domain users.

## D032 Role in /auth/me
/auth/me omitted role, so after any refresh or refreshUser() the admin menu and /admin disappeared. It now returns role, and AuthContext stores it in sr_user. On network or 500 errors AuthContext uses the cached sr_user instead of sending a signed-in user to /login; 401 still signs out.

## D033 Inactivity logout
User asked for automatic sign-out after 1 hour of inactivity. Before this the only limit was the JWT exp (tenant.session_ttl, absolute, default 24h). Chosen: client-side idle timer in frontend/src/hooks/useIdleLogout.js, last activity in localStorage sr_last_active so all tabs share it, checked every 30s and on tab focus by comparing timestamps (correct after laptop sleep), writes throttled to 15s. A running request counts as activity so a 10 minute extraction cannot sign the user out. Rejected for now: server-side idle enforcement, which needs sliding or refresh tokens and a schema change. Edge cases: several tabs, sleep and wake, long uploads, sessions from before this change (no sr_last_active, timer starts on load), blocked storage, all roles treated alike, tenant session_ttl stays the hard cap.

## D034 Expired token handling
The 401 interceptor sent every 401 to /login with a full reload, even on a public call, and gave no reason; an expired token was only noticed on the next click. Now the request interceptor reads exp from the JWT (30s leeway for a fast client clock, undecodable token counts as expired) and the idle check also catches it. endSession(reason) clears sr_token, sr_user, sr_last_active and redirects unless already on /login; a 401 only signs out when the request carried a token. Reasons idle, expired, ended go through sessionStorage to Login.jsx, shown once; manual sign-out shows none. Edge cases: 401 on /login (no loop), revoked allowlist entry (ended), stale session on load (cleared before /auth/me).

## D035 Payment pages through the api client
frontend/src/pages/Pricing.jsx and frontend/src/pages/Paymentcallback.jsx used raw axios with their own BASE_URL and token header, so they skipped the 401 and expiry handling. They now use getPacks, initializePayment and verifyPayment in frontend/src/api/client.js. Behaviour change: a session that expires while the user is on Paystack now leads to sign-in instead of an error; the Paystack webhook still credits the payment.

## D036 history_mode per tenant
First Asset Management raised the lack of an issuer historical review during procurement. There is no staging environment, so the feature ships switched off: tenants.history_mode (0005_issuer_history) is "off" for every existing row and only seed.py's localhost tenant gets "shadow". "off" hides the RC field and history slots, skips the extra AI calls and returns history null from /preview. Turn it on per tenant in the Supabase SQL editor (UPDATE tenants SET history_mode = 'shadow' WHERE hostname = '...') or, without dashboard access, in the Render Shell: python set_history_mode.py <hostname> shadow (backend/set_history_mode.py; --list shows every tenant). Edge cases: a draft started with history and finished after the tenant is switched off is scored without history; /assessment/issuer/{rc} answers found false when off.

## D037 Shadow mode
The adjustment (A direction + B stability + C red flags, clamped to -5..+3, times the confidence factor 1.0 / 0.5 / 0) has not been back-tested, so it is saved in assessments.history and shown as "indicative, not applied" in the app, PDF and AI narrative, and total_score, eligible and the cut-off are unchanged. history.applied is always false. "applied" is reserved for Phase 2 after the back-test; total_score is an integer column, so applying a 0.5-step adjustment will need a rounding rule or a new column then.

## D038 Trend ratios and bands
Direction compares the oldest and latest year on the model's own ratios: Net Income Margin, Interest Coverage, Net Debt / EBITDA (lower is better) and Acid-Test, each +/-0.5 when the relative change exceeds 10%. The relative change is measured against max(|old|, floor) (1 pt, 0.5x, 0.5x, 0.1x) so near-zero values do not swing it; interest coverage is capped at 10x (60x to 40x is not weaker) and "no debt" counts as 10x; negative EBITDA appearing or disappearing is weaker or better. Stability: coefficient of variation of EBITDA margin below 15% +1, above 35% -1, mean margin at or below zero -1. Red flags (-1 each, max 4): a loss year, negative operating cash flow in the latest year or in two years, debt growth more than 25 points above EBITDA growth, Altman Z' below 1.23 (the model's own distress band, not the original Z's 1.8). Trends never use naira growth, so inflation and devaluation do not read as improvement. DSCR and Altman Z' are shown for context only.

## D039 History extraction
backend/api/claude.py PERIODS_PROMPT returns every Company column of a statement (period end, length, audited, 17 fields including operating cash flow); the main EXTRACTION_PROMPT is untouched so the scored figures do not change. With history on, the scored statement is read twice (main prompt plus PERIODS_PROMPT for its prior-year column and operating cash flow), plus one call per prior, older or interim upload, all with asyncio.gather. So the current statement plus one older statement gives three years, and a stored issuer may need none. Cost: up to four extra Opus calls per assessment, still one credit (open question for pricing). Only the scored statement can fail the extraction (refund as D025); a failed history document becomes a warning in figures.history.warnings. History files are checked before the credit is charged, like every other file.

## D040 Merge rule
backend/api/history.py merge_periods keeps one record per (period end, length): the analyst-reviewed scored statement always wins its own year; otherwise audited beats unaudited, then the newest document (docPeriodEnd), so a restated comparative replaces the original. A difference above 2% on revenue, net income, EBIT, total assets or equity is kept as a restatement note and shown on Review Data, Scores and the PDF. The merge runs at extraction too, so Review Data shows one column per period. Interim prior halves are kept without a balance sheet (interim reports compare the balance sheet with the last year end). Years are lined up 9 to 18 months apart; a gap of more than 1.5 months from 12 is noted as an irregular period (year-end change) and lowers confidence to partial. A missing year is never bridged by an older one.

## D041 Storage
issuers (tenant, RC number) and issuer_periods (one row per issuer, period end and length; RLS on). Periods are saved by /run only, so only figures the analyst reviewed are kept, and only when an RC number is given. A row is replaced only by a document at least as new (or the scored statement); the replaced figures go to previous_figures. A storage error is logged and rolled back without failing the run, because the result is already saved. History is never shared across tenants, including tenants with history on (tested). RC numbers are digits only, leading zeros dropped.

## D042 Interim early warning
The latest half-year is compared with the same half a year earlier: net income margin down more than 2 points, interest coverage down more than 20%, acid-test down more than 15%, operating cash flow negative. Half-years are never annualised and Debt / EBITDA is not calculated for them. An interim not later than the latest audited year is ignored ("stale"); one without the prior half shows "no comparison" and a check without data shows "Not available", never "Passed". It never changes the score or the history adjustment. A triggered check needs an analyst comment: the Scores step asks for it and /run returns 422 without it. The comment is saved in figures.history and printed in the PDF.

## D043 One-off items
Review Data lets the analyst enter a one-off amount per period (and for the scored year) with a required reason. It is removed from EBIT, EBITDA and net income for the trend only; the 56-point score keeps the figures as entered. The PDF notes list each exclusion and its reason.

## D044 Report and narrative
Only when at least two years are available: the header adds "N-year history: Weakening/Stable/Improving", the scorecard adds HISTORICAL PERFORMANCE and INTERIM EARLY WARNING tiles (8 tiles), a HISTORICAL PERFORMANCE section follows the scoring breakdown (6-ratio table with interim columns, adjustment breakdown, notes and sources) and the disclaimer says the adjustment is indicative. The narrative prompt gets the history block, must ground futureRisksReview in the trend and say plainly when the latest year and the trend disagree, must not claim the score was adjusted, and returns historicalReview. Assessments saved before 0005 have no history and print as before. Not done in Phase 1: trend lines under the PDF KPI strip.

## D045 Memory on the 512MB Render instance
User keeps the 0.5 CPU / 512MB instance. Measured in the sandbox: the app idles at about 120MB; four 20MB documents read in parallel (the scored statement is sent twice) peak at about 325MB more, too close to 512MB once the SDK and server are added; four 5MB documents add about 90MB. So the history slots together are capped at HISTORY_MAX_TOTAL_MB (default 30MB, checked before the credit is charged, 413 with a clear message) and at most HISTORY_AI_CONCURRENCY (default 2) history reads run at once beside the main extraction. The scored statement keeps its own 20MB limit. Worst case is now about 50MB of files and three AI requests at once. Trade-off: with four history reads the extraction takes about two rounds instead of one, still inside the 600s client timeout in normal conditions. Both values are environment variables, so they can change on Render without a deploy of new code. Edge case: a large scanned statement is the most likely to hit the cap; the message tells the analyst to upload only the statements pages.

## D046 PDF only, two audited statements
User decision. Every upload slot (financial statement, previous year, interim, rating report, CP terms email) takes exactly one PDF; JPG, PNG, WebP and HEIC are refused in the browser and by backend/api/documents.py (415, before any credit is charged), including photos renamed to .pdf, since the type is read from the bytes. This replaces the photo part of D024. Scanned PDFs still work: Claude reads PDF pages as images, and the scanned-page warning stays. The extraction prompts no longer mention photographs.
Upload now shows two audited statements, because almost every audited statement carries the prior year as a comparative: "Most recent audited financial statement" (the scored year, e.g. FY2025 with FY2024) and "Previous year's audited statement" (e.g. FY2024 with FY2023), plus the optional half-year interim. Three years from two documents, and the shared year is checked for restatements (D040). The previous-year box also takes the latest earlier statement when the previous year is missing (e.g. FY2023 gives FY2023 and FY2022; years are lined up by date). The older_pdf field stays in the API, unused by the app, so nothing that already sends it breaks. Edge cases: a statement without a comparative column gives fewer years and Partial confidence; an issuer with stored history may need no second statement.

## D047 Exact band labels and benchmarks
User found the Band column suspect. The app and PDF show the engine's own labels (no second copy in the frontend), and for the assessment reviewed every band and score matched the engine. But the labels themselves misquoted the conditions: gaps between bands meant 10.0% net margin showed "10.1 - 15%", 5.5% revenue growth "6 - 15%", 15.5% "16 - 30%", 50.0% debt ratios "50.1 - 75%", 1.55x interest cover "1.6 - 3.0x", 3.05x net debt/EBITDA "3.1 - 3.5x". Three benchmarks (printed in the PDF) did not match full marks: acid-test "≥ 1x" (full marks need > 1.5x), net income margin "≥ 20%" and ROA "≥ 15%" (both need more than the figure). Fixed in backend/api/scoring.py for v1.2 and v2.0: labels now name exactly the values their condition scores ("> 15 – 20%" = above 15 up to 20; "1.0 – < 1.5x" = 1.0 up to but not 1.5), benchmarks equal the full-marks band. Conditions and points are unchanged, so no score changes; saved assessments keep their old label text. Tests probe every band from -20 to 150 and each boundary +/-0.001 against its label, and check each benchmark is the full-marks band.
Not changed (user decision pending): values are banded at full precision but shown rounded, so a ratio within rounding of a boundary can look misplaced (DSCR 1.497 shows "1.50x" in "1.25 – < 1.5x"); and the same band earns different points on different ratios by design (e.g. "> 50 – 75%" is 2 points on Debt to Asset, 1 on Debt to Capital).
Also: history ratios now show N/A, not 0.00x, when a period lacks the inputs (an interim's prior half has no balance sheet, so its acid-test was shown as 0.00x).

## D048 Model v2.1: Acid-Test full marks above 1.0x
User decision. The Acid-Test now scores 2/2 above 1.0x and keeps the -2 penalty at or below 1.0x; the old 1.0 - 1.5x band (1 point) is removed and the benchmark is "> 1.0x". Max stays 2, total 56, cut-off 34. Released as a new model version, v2.1 (MODEL_VERSION), per D021: saved assessments keep their v2.0 scores and say so; new assessments and re-run drafts use v2.1. Effect: an issuer with an acid-test above 1.0x and up to 1.5x gains 1 point (Streadvest 53 to 54); others are unchanged. Edge cases: exactly 1.00x is a penalty (the user's rule is strictly above 1.0x), and a value such as 1.004 shows as "1.00x" but scores full marks, because bands use the unrounded value (D047, open). backend/scripts/backtest_models.py now compares v2.0 with v2.1 by default; run it in the Render Shell to list saved assessments whose eligibility would change.

## D049 Score table columns and colours
User decision, after reading the Band column as the target. The app's score table (Scores, Result and the dashboard, all frontend/src/components/RatioTable.jsx) now shows Ratio | Benchmark (value for full marks, from the engine) | Result | Band (where the result landed) | Score. Partial scores use amber (--score-part, #8A5300 on #FEF6E7) instead of green, matching the Score Colour Guide (green = full marks, amber = positive but below, red = zero or negative); the green had made 1/5 look like full marks. "Scoring model vX" appears under the total on Scores and Result. The PDF already shows Result then Benchmark and is unchanged. Edge case: on a phone the five columns scroll sideways inside their card (min width 560px).

## D050 Issuer sector, FI ratios and peer medians (spec Phase 1 with FI ratios)
User decisions 2026-11-12: Phase 1 first; for financial services, also extract and calculate the FI ratios (not just a peer panel); peer medians hidden until checked against the filed statements; insurers out of the first FI version. Off by default per tenant: tenants.fi_mode off | shadow, switched with backend/set_fi_mode.py like history_mode.
With fi_mode on, Upload and Review Data show a Sector field (backend/api/fi.py SECTORS; financial_services = banks, finance companies, MFBs, leasing, lending fintechs; fintech_payments keeps the standard ratios only). For financial_services, /extract runs a second read of the scored statement (FI_PROMPT, same semaphore as history, so memory stays inside D045) for gross and Stage 3 loans, allowance, impairment charge, interest income and expense, operating income and expenses, interest-earning assets, liquid assets, deposits, borrowings (due in 12 months and total) and the reported CAR and liquidity ratio. A failed read is a warning and the analyst types the figures. The 11 FI ratios (two funding ratios include customer deposits for deposit-takers; averages fall back to year-end with a note) are shown on Scores, Result and a PDF section, labelled indicative. They never change the SmartRisk score (tested).
Peer medians: peer_benchmarks (sector, ratio, financial year, peer group, median, p25, p75, n, company values, verified). backend/scripts/load_benchmarks.py loads a per-company CSV (data/peer_data_fy2025_banks.csv, 11 NGX-listed banks, from the Sheet of 12 Nov 2026) as NOT verified; `verify` marks a year verified once every value is checked. Shown only when verified, n >= 5 and no more than 2 years older than the issuer's year. assessments.sector and assessments.fi save the ratios and medians as they stood, so old reports never change.
Edge cases: a finance company is compared with bank medians (the peer group is named on screen and in the PDF; non-bank lenders are only 4 listed, below n = 5); peer definitions differ (NPL vs Stage 3, coverage with regulatory reserves, holding company CAR), stated as a guide; sector changed after extraction leaves the FI figures empty for manual entry (no extra credit); the narrative does not yet discuss the FI ratios; issuers.sector is not stored, so an RC lookup does not prefill the sector.

## D051 Sector check and suggested sector
User decision after a cocoa trader (Sunbeth Global) was tagged Financial services and its FI ratios came out mostly N/A. Two guards:
1. Suggested sector. The main extraction (same call, no extra credit, every tenant) also returns principalActivity (one sentence from the directors' report or Note 1) and suggestedSector (one of the api/fi.py codes; agro-commodity sourcing and trading counts as agriculture). Unknown codes are dropped and the text is cut to 200 characters. With fi_mode on, Review Data shows "Suggested sector: X" with the principal activity and a "Use X" button whenever it differs from the sector picked. Nothing is changed without the analyst's click.
2. Lender check. If an issuer is tagged financial_services but the FI read found no loans, Stage 3 loans, interest income or customer deposits, compute_fi returns status not_lender: no FI ratios on Scores, Result or the PDF, and Review Data shows "This issuer does not look like a lender".
Edge cases: a real lender whose FI read failed is also flagged (the analyst types the figures or keeps the sector); switching to financial services after extraction leaves the FI figures empty for manual entry, since the FI read only runs when the sector is chosen before extraction; the suggestion is the model's reading of the statement and can be wrong for groups with several businesses; assessments extracted before this change have no suggestion.
