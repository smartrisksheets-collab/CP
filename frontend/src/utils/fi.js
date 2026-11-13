// Sector list and financial-institution (FI) figure fields; the ratios are worked out in backend/api/fi.py.
// Keep SECTORS in step with SECTORS there.

export const SECTORS = [
  ["financial_services", "Financial services"],
  ["fintech_payments",   "Fintech (payments)"],
  ["manufacturing",      "Manufacturing"],
  ["consumer_goods",     "Consumer goods"],
  ["oil_gas",            "Oil and gas"],
  ["telecom",            "Telecoms"],
  ["aviation",           "Aviation"],
  ["healthcare",         "Healthcare"],
  ["agriculture",        "Agriculture"],
  ["real_estate",        "Real estate and construction"],
  ["other",              "Other"],
];

export const isFiSector = (sector) => sector === "financial_services";

// [id, label, kind]; kind "pct" is a ratio the issuer reports, otherwise N'000
export const FI_GROUPS = [
  ["Loans and asset quality", [
    ["grossLoans",        "Gross loans (₦'000)"],
    ["priorGrossLoans",   "Prior year gross loans (₦'000)"],
    ["stage3Loans",       "Stage 3 / non-performing loans (₦'000)"],
    ["stage3Allowance",   "Stage 3 impairment allowance (₦'000)"],
    ["impairmentCharge",  "Impairment charge on loans (₦'000)"],
  ]],
  ["Earnings", [
    ["interestIncome",             "Interest income (₦'000)"],
    ["interestExpense",            "Interest expense (₦'000)"],
    ["operatingIncome",            "Operating income before impairment (₦'000)"],
    ["operatingExpenses",          "Operating expenses (₦'000)"],
    ["interestEarningAssets",      "Interest-earning assets (₦'000)"],
    ["priorInterestEarningAssets", "Prior year interest-earning assets (₦'000)"],
  ]],
  ["Liquidity, funding and capital", [
    ["liquidAssets",           "Liquid assets: cash, placements, T-bills (₦'000)"],
    ["customerDeposits",       "Customer deposits (₦'000)"],
    ["borrowingsDue12m",       "Borrowings due within 12 months (₦'000)"],
    ["totalBorrowings",        "Total borrowings (₦'000)"],
    ["capitalAdequacyRatio",   "Capital adequacy ratio, as reported (%)", "pct"],
    ["reportedLiquidityRatio", "Regulatory liquidity ratio, as reported (%)", "pct"],
  ]],
];

// Same checks as fi_input_error in backend/api/fi.py. Returns "" when the inputs can be used.
export function fiInputError(figures) {
  if (!isFiSector(figures?.sector)) return "";
  const f = figures.fi || {};
  const n = (k) => (f[k] === null || f[k] === undefined || f[k] === "" ? null : Number(f[k]));
  for (const [k, label] of [["capitalAdequacyRatio", "Capital adequacy ratio"], ["reportedLiquidityRatio", "Regulatory liquidity ratio"]]) {
    const v = n(k);
    if (v !== null && (v < 0 || v > 100)) return `${label} must be a percentage between 0 and 100.`;
  }
  for (const k of ["grossLoans", "priorGrossLoans", "stage3Loans", "stage3Allowance", "liquidAssets", "customerDeposits",
                   "borrowingsDue12m", "totalBorrowings", "interestEarningAssets", "priorInterestEarningAssets"]) {
    const v = n(k);
    if (v !== null && v < 0) return "Financial-institution balances cannot be negative.";
  }
  if (n("stage3Loans") !== null && n("grossLoans") !== null && n("stage3Loans") > n("grossLoans")) return "Stage 3 loans cannot be more than gross loans.";
  if (n("borrowingsDue12m") !== null && n("totalBorrowings") !== null && n("borrowingsDue12m") > n("totalBorrowings")) {
    return "Borrowings due within 12 months cannot be more than total borrowings.";
  }
  return "";
}
