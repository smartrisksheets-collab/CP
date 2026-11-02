# Build Log

## 2026-10-27 FAM scoring fixes (p7, p8, p9)
- p7 (spec P1): Current and Cash ratios, Liquidity Ratios group, CURRENT RATIO in PDF header, tradePayables and current liabilities split, /assessment/preview, RatioTable.jsx, backend/tests
- p8 (spec P2): band tables, items 4 and 6 to 9, labels 13 and 14, model_version (backend/alembic/versions/0003_model_version.py, backend/alembic/sql/0003_model_version.sql), backend/scripts/backtest_models.py
- p9: MODEL_VERSION v2.0, User Guide points, "12-ratio" wording
- Checks: fresh dev checkout, git apply, import, pytest 35 passed, PostgreSQL 16 upgrade / downgrade / upgrade with backfill, npm run build, eslint clean on touched files (repo 57 to 44 problems)
- Decisions: D019 to D023

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
