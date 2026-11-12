// Shared helpers for the issuer history screens (backend/api/history.py does the analysis)

export function periodLabel(p) {
  const d = new Date(`${p.periodEnd}T00:00:00`);
  if (isNaN(d.getTime())) return p.periodEnd || "?";
  const months = Number(p.periodMonths) || 12;
  if (months >= 12) return `FY${d.getFullYear()}`;
  if (months === 6) return `${d.getMonth() <= 6 ? "H1" : "H2"} ${d.getFullYear()}`;
  return `${months}M ${d.toLocaleDateString("en-NG", { month: "short", year: "numeric" })}`;
}

// Returns an error message when the history inputs cannot be used as entered, or "".
export function historyInputError(history) {
  if (!history) return "";
  if (history.fy0OneOff?.amount && !history.fy0OneOff?.reason?.trim()) return "Give a reason for the one-off item in the scored year.";
  for (const p of history.periods || []) {
    if (p.oneOff?.amount && !p.oneOff?.reason?.trim()) return `Give a reason for the one-off item in ${periodLabel(p)}.`;
  }
  return "";
}
