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
