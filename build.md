# Build Log

## 2026-10-31 Upload hardening and error messages (p11 to p14)
- p11: photos (up to 20 per slot) and scanned PDFs accepted; new backend/api/documents.py and frontend/src/utils/documentInput.js; files checked before the credit is charged; failed extraction refunds and marks the debit refunded; financial check reads 100 pages (was 15); client timeouts 600s / 330s; backend/tests/test_documents.py
- p12: errorMessage() in frontend/src/api/client.js used by every screen (offline, timeout, unreachable, 429, 413, 422, 502 to 504, 500); OfflineBanner.jsx; backend/main.py middleware keeps CORS headers on unhandled 500s; backend/tests/test_errors.py; Scores out-of-credit message fixed
- p13: keyword matching ignores spacing and apostrophes (UNA 2025 statements were rejected over double spaces)
- p14: keyword and client-name checks only warn; NFKC normalisation for ligatures
- Checks: fresh dev checkout with p11 to p14, pytest 51 passed, import, npm run build, eslint clean on touched files, headless Chromium tests (scanned, mixed, locked, damaged PDFs, rotated photos, offline banner), UNA PDF passes
- Not tested in sandbox: real AI extraction of scans and photos, refund against Supabase
- Decisions: D024 to D029

## 2026-11-02 Admin test-email allowlist (p16, p16b, p16c)
- p16: email_allowlist table (backend/alembic/versions/0004_email_allowlist.py, backend/alembic/sql/0004_email_allowlist.sql); backend/api/allowlist.py (domain lists moved from register.py, normalize_email, is_revoked); routes GET/POST /admin/allowlist and POST /admin/allowlist/revoke; register and verify-email allow listed personal emails; revoked users get 401 on API calls and 403 on request-otp and verify-otp; /auth/me returns role (fixes admin menu and /admin vanishing after refresh); AuthContext keeps the session on network errors; Admindashboard uses the api client, confirm dialogs, retry, Test emails tab, CSS variables; access code no longer printed in request_otp log; admin emails stripped, credit amount 0 rejected
- p16b: frontend/vite.config.js lets a browser refresh on /admin load the app instead of a backend 404 (local dev only)
- p16c: revoked badge in Users tab, revoked users cannot be made admin, tab counts all entries
- Checks: fresh dev checkout, git apply, import, PostgreSQL 16 upgrade / downgrade -1 / upgrade, schema matches models.py, pytest 63 passed (12 allowlist tests), npm run build, eslint clean on touched files (repo 20 errors, all pre-existing); Vite refresh on /admin returns the app
- User tested locally: add, register, revoke, restore
- Not tested in sandbox: Resend emails; Supabase SQL (user runs backend/alembic/sql/0004_email_allowlist.sql)
- Decisions: D030 to D032

## 2026-11-09 Session expiry and inactivity logout (p17, p17b)
- p17: frontend only. New frontend/src/hooks/useIdleLogout.js (used by AuthContext) signs out after 60 minutes without input (VITE_IDLE_TIMEOUT_MINUTES overrides), timer shared across tabs via localStorage sr_last_active, running requests count as activity, other tabs follow a sign-out; frontend/src/api/client.js adds endSession, isTokenExpired (JWT exp, 30s leeway), pending request count, 401 signs out only when the request carried a token; AuthContext clears stale sessions on load; Login.jsx shows idle, expired or ended notice (.sr-session-notice in index.css)
- p17b: Pricing.jsx and Paymentcallback.jsx use getPacks, initializePayment, verifyPayment from client.js instead of raw axios
- Checks: fresh dev checkout, git apply, npm ci, npm run build, npm run lint 23 problems before and after (all pre-existing), headless Chromium with mocked API and fake clock (idle and expired on load, 401 without reload loop, activity keeps session, 61 min idle signs out, pending request keeps session, cross-tab follow, manual sign-out without notice, notice shown once, payment verify success and 401)
- Not tested in sandbox: real backend, OTP login and Paystack; tenant session_ttl values in Supabase unknown
- Decisions: D033 to D035

## 2026-11-12 Issuer history, Phase 1 shadow mode (p18)
- New: backend/api/history.py (merge, year selection, trend, A/B/C adjustment, confidence, interim early warning), backend/api/issuer_store.py, backend/alembic/versions/0005_issuer_history.py, backend/alembic/sql/0005_issuer_history.sql, backend/tests/test_history.py (43), backend/tests/test_history_api.py (7), frontend/src/components/HistoryEditor.jsx, HistoryPanel.jsx, frontend/src/utils/history.js
- Changed: backend/api/models.py (Issuer, IssuerPeriod, assessments.rc_number and history, tenants.history_mode), backend/api/claude.py (PERIODS_PROMPT, history block in the narrative prompt), backend/api/routes/assessment.py (/extract history slots and rc_number, /preview and /run history, GET /assessment/issuer/{rc}), backend/api/routes/tenant.py (historyMode), backend/api/report.py (header line, two tiles, section, footer), backend/seed.py (localhost tenant shadow), backend/tests/test_documents.py and test_report.py; frontend Upload.jsx (RC number, stored-history notice, three history slots), ReviewData.jsx, Scores.jsx (history panel, analyst comment), Result.jsx, AppPage.jsx, api/client.js
- Checks: PostgreSQL 16 upgrade / downgrade -1 / upgrade; pytest 117 passed (63 before, plus 54 new or changed); sample PDFs rendered and inspected (history with interim, two years, one year, no history); npm run build; npm run lint 23 problems before and after (all pre-existing); headless Chromium against the real API with stubbed AI calls: upload with RC number and history slots, Review Data columns and restatement warning, Scores panel, comment required, Result panel, PDF download, periods stored
- Not tested in sandbox: real AI extraction with PERIODS_PROMPT on real statements, Supabase SQL, Render deploy
- Decisions: D036 to D044

## 2026-11-12 History memory limits for the 512MB instance (p18b)
- Changed: backend/api/routes/assessment.py (HISTORY_MAX_TOTAL_MB 30, HISTORY_AI_CONCURRENCY 2), backend/tests/test_history_api.py (+2), frontend Upload.jsx note
- Checks: pytest 119 passed; memory measured for 4 x 5MB, 4 x 10MB and 4 x 20MB uploads
- Decision: D045
- Added backend/set_history_mode.py (switch history per tenant from the Render Shell; tested --list, on, off, bad mode, unknown host)

## 2026-11-12 PDF only and two audited statements (p19)
- Changed: backend/api/documents.py (one PDF per slot), backend/api/claude.py and routes/assessment.py (wording), backend/tests/test_documents.py; frontend utils/documentInput.js (PDF only, photo code removed), Upload.jsx (older-statement box removed, labels), CPTerms.jsx
- Checks: pytest 120 passed; npm run build; npm run lint 23 before and after; Chromium: every file input accepts .pdf only, single file, a JPG shows the PDF-only error, two statement boxes plus interim
- Decision: D046

## 2026-11-12 Exact band labels and benchmarks (p20)
- Changed: backend/api/scoring.py (labels and benchmarks only), backend/api/history.py (N/A for missing inputs), backend/tests/test_scoring.py (+label and benchmark checks), backend/tests/test_history.py, frontend AppPage.jsx (DSCR best practice text)
- Checks: pytest 124 passed; band probe test fails on the old labels and passes on the new; PDF rendered and inspected; npm run build; lint 23 unchanged
- Decision: D047

## 2026-11-12 Model v2.1, Acid-Test above 1.0x (p21)
- Changed: backend/api/scoring.py (_V21, MODEL_VERSION v2.1), backend/tests/test_scoring.py (+6), backend/scripts/backtest_models.py (default v2.0 vs v2.1), frontend AppPage.jsx (best practice > 1.0x)
- Checks: pytest 132 passed; build; lint 23 unchanged
- Decision: D048

## 2026-11-12 Score table columns, colours and model version (p22)
- Changed: frontend RatioTable.jsx, Scores.jsx, Result.jsx, index.css
- Checks: npm run build; lint 23 unchanged; Chromium screenshot of Scores (Benchmark, Result, Band, Score; green/amber/red; "Scoring model v2.1")
- Decision: D049

## 2026-11-12 Sector, FI ratios and peer medians (p23)
- Added: backend/api/fi.py, backend/api/benchmarks.py, backend/scripts/load_benchmarks.py, backend/set_fi_mode.py, backend/data/peer_data_fy2025_banks.csv, migration 0006_fi_peers (+ SQL file), backend/tests/test_fi.py (19), backend/tests/test_fi_api.py (11); frontend utils/fi.js, components/FiEditor.jsx, components/FiPanel.jsx
- Changed: backend/api/models.py, claude.py (FI_PROMPT), routes/assessment.py, routes/tenant.py, report.py (FI section), seed.py (localhost fi_mode shadow), tests/test_documents.py; frontend Upload.jsx (Sector field), ReviewData.jsx, Scores.jsx, Result.jsx
- Checks: pytest 162 passed; alembic upgrade/downgrade/upgrade on PostgreSQL 16; PDF rendered and inspected; npm run build; lint unchanged (only pre-existing errors); Chromium: Upload one row with Sector, Review Data FI figures, Scores FI panel with peer medians (local medians marked verified for the check only)
- Decision: D050

## 2026-11-12 Sector check and suggested sector (p24)
- Changed: backend/api/claude.py (principalActivity, suggestedSector, clean_sector_hint), backend/api/fi.py (looks_like_lender, status not_lender), backend/tests/test_fi.py (+3); frontend utils/fi.js, components/FiEditor.jsx
- Checks: pytest 165 passed; npm run build; Chromium: Review Data shows the suggestion and the not-a-lender warning, "Use Agriculture" switches the sector and hides the FI figures
- Decision: D051

## 2026-11-12 Bonds, loans and general reviews (p25)
- Added: backend/api/instruments.py, backend/set_instrument_mode.py, migration 0007_instruments (+ SQL file), backend/tests/test_instruments.py (9), backend/tests/test_instruments_api.py (6); frontend utils/instruments.js, components/steps/InstrumentTerms.jsx
- Changed: backend/api/claude.py (BOND_TERMS_PROMPT, narrative instrument block and rules), routes/assessment.py (/extract instrument, /extract-terms, /run), routes/tenant.py, models.py, report.py (title, instrument line, terms sections, disclaimer), seed.py, tests/test_documents.py; frontend Upload.jsx (instrument picker, terms step routing), App.jsx, AppPage.jsx (subtitle, FAQ), Login.jsx, Register.jsx, Onboarding.jsx, Pricing.jsx, api/client.js
- Checks: pytest 180 passed; alembic up/down/up on PostgreSQL 16; bond PDF rendered and inspected; npm run build; lint 23 unchanged; Chromium: Upload picker, bond terms step, "Corporate Credit Assessment" subtitle
- Decision: D052
