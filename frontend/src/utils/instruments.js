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

// The four services (D053): each has its own steps. Upload sub-steps and the app's steps map onto them
// in flowIndex below. Statements are always read the same way; only the steps around them differ.
export const SERVICES = {
  cp: {
    name: "Commercial paper", entity: "Issuer",
    blurb: "Score a CP issuer against the 60% pass mark, with the offer's indicative terms.",
    steps: ["Statements", "CP terms", "Review", "Scores", "Result"],
  },
  bond: {
    name: "Corporate bond / note", entity: "Issuer",
    blurb: "Score a bond or note issuer, with coupon, maturity and security read from the term sheet.",
    steps: ["Statements", "Bond terms", "Review", "Scores", "Result"],
  },
  loan: {
    name: "Loan or facility", entity: "Applicant",
    blurb: "Start from the facility request, then check whether earnings can carry the repayments.",
    steps: ["Facility request", "Statements", "Review", "Repayment check", "Result"],
  },
  review: {
    name: "General review", entity: "Company",
    blurb: "A financial health report on a customer or counterparty. No instrument, no pass or fail.",
    steps: ["Statements", "Review", "Health report"],
  },
};
export const SERVICE_ORDER = ["cp", "bond", "loan", "review"];
export const serviceOf = (code) => SERVICES[code] || SERVICES.cp;

// Position in the service's own steps from the app step (0 upload, 1 review, 2 scores, 3 result)
// and the upload sub-step (0 or 1)
export function flowIndex(code, step, subStep) {
  if (code === "review") return Math.min(step, 2);
  if (step === 0) return subStep ? 1 : 0;
  return step + 1;
}

// Colours for the repayment check and health readings
export const TONE = {
  good: { bg:"#EAF3DE", fg:"#27500A", bd:"#97C459" },
  mid : { bg:"#FEF6E7", fg:"#7A4F00", bd:"#F0C060" },
  bad : { bg:"#FCEBEB", fg:"#791F1F", bd:"#F09595" },
};
export const overallTone = (o) => TONE[{ Comfortable:"good", Tight:"mid" }[o] || "bad"];
export const ratingTone  = (r) => TONE[{ Strong:"good", Fair:"mid" }[r] || "bad"];

export const REPAYMENT_TYPES = [
  ["amortising", "Equal instalments"], ["equal_principal", "Equal principal"],
  ["bullet", "Bullet at maturity"], ["revolving", "Revolving / overdraft"],
];

// Wording that changes once a tenant can assess more than commercial paper
export function useProductCopy() {
  const { tenant } = useTenant();
  const multi = !!tenant?.instrumentMode && tenant.instrumentMode !== "off";
  return {
    multi,
    subtitle : multi ? "Corporate Credit Assessment" : "Commercial Paper Risk Assessment",
    heroLabel: multi ? "Corporate Credit Assessment" : "Commercial Paper Assessment",
    heroSub  : multi ? "Commercial paper, bonds, loans and general reviews, each with its own steps."
                     : "Analyse Commercial Paper offerings in 4 quick steps.",
    issuers  : multi ? "issuers and borrowers" : "CP issuers",
    termsFeature: multi ? "CP and bond terms extraction" : "CP indicative terms extraction",
  };
}
