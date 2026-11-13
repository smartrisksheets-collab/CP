// What is being assessed (backend/api/instruments.py, decision D052). Keep the lists in step.
import { useTenant } from "../context/TenantContext.jsx";

export const INSTRUMENTS = [
  ["cp",     "Commercial paper",      "Short-term notes"],
  ["bond",   "Corporate bond / note", "Coupon, maturity, security"],
  ["loan",   "Loan or facility",      "Amount, tenor, repayment, collateral"],
  ["review", "General review",        "No instrument: financial health check"],
];

export const instrumentLabel = (code) => (INSTRUMENTS.find(([c]) => c === code) || INSTRUMENTS[0])[1];

export const BOND_FIELDS = [
  ["issuer", "Issuer"], ["programmeSize", "Programme size"], ["issueSize", "Issue size"],
  ["series", "Series / tranche"], ["coupon", "Coupon"], ["couponFrequency", "Coupon frequency"],
  ["tenor", "Tenor"], ["issueDate", "Issue date"], ["maturityDate", "Maturity date"],
  ["security", "Security / ranking"], ["guarantee", "Guarantee or credit enhancement"],
  ["redemption", "Redemption"], ["callOption", "Call option"], ["issueRating", "Issue rating"],
  ["trustee", "Trustee"], ["useOfProceeds", "Use of proceeds", true],
];

export const LOAN_FIELDS = [
  ["facilityType", "Facility type"], ["amount", "Amount"], ["tenor", "Tenor"],
  ["interestRate", "Interest rate / pricing"], ["repayment", "Repayment"], ["moratorium", "Moratorium"],
  ["collateral", "Collateral / security", true], ["guarantee", "Guarantee"],
  ["purpose", "Purpose", true], ["covenants", "Key covenants", true],
];

export const TERM_FIELDS = { bond: BOND_FIELDS, loan: LOAN_FIELDS };

// Wording that changes once a tenant can assess more than commercial paper
export function useProductCopy() {
  const { tenant } = useTenant();
  const multi = !!tenant?.instrumentMode && tenant.instrumentMode !== "off";
  return {
    multi,
    subtitle : multi ? "Corporate Credit Assessment" : "Commercial Paper Risk Assessment",
    heroLabel: multi ? "Corporate Credit Assessment" : "Commercial Paper Assessment",
    heroSub  : multi ? "Assess commercial paper, bonds, loans and counterparties in 4 quick steps."
                     : "Analyse Commercial Paper offerings in 4 quick steps.",
    issuers  : multi ? "issuers and borrowers" : "CP issuers",
    termsFeature: multi ? "CP and bond terms extraction" : "CP indicative terms extraction",
  };
}
