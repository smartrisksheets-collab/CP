# Build Log

## 2026-10-26 Scoring fixes
- Changed: backend/api/scoring.py, backend/api/report.py, backend/api/claude.py (prompt, narrative DSCR), frontend/src/components/steps/Scores.jsx, ReviewData.jsx, frontend/src/pages/AppPage.jsx
- Checks: Veritasi figures give ICR 1.89x (4 pts), DSCR 0.44x (0 pts); edge cases (no debt, negative cost, missing cost, negative EBITDA, string values) pass; npm run build passes; no new lint issues (18 pre-existing); app starts
- Decisions: D016 to D018

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
