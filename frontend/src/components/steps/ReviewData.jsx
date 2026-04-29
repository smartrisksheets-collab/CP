import { useState } from "react";

const AI  = { background:"#EEF4FF", borderColor:"#9DBFEA" };
const MAN = { background:"#ecfdf5", borderColor:"#01b88e" };

function Field({ label, id, figures, onChange, manual, readonly, step, placeholder }) {
  const val = figures[id];
  const style = {
    width:"100%", padding:"8px 10px", fontSize:13, border:"1px solid",
    borderRadius:6, fontFamily:"Arial,sans-serif", color:"#1F2854",
    boxSizing:"border-box",
    ...(readonly ? { cursor:"not-allowed", ...AI } : manual ? MAN : AI),
  };
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
      <label style={{ fontSize:12, color:"#5A5A5A" }}>{label}</label>
      <input
        style={style}
        type="number"
        step={step || "1"}
        placeholder={placeholder}
        readOnly={readonly}
        value={val ?? ""}
        onChange={(e) => !readonly && onChange(id, e.target.value === "" ? null : parseFloat(e.target.value))}
      />
    </div>
  );
}

export default function ReviewData({ figures, onChange, onBack, onNext }) {
  const [error, setError] = useState("");

  function set(id, val) {
    const next = { ...figures, [id]: val };
    // Auto-compute EBITDA
    const ebit = parseFloat(next.ebit) || 0;
    const da   = parseFloat(next.depreciationAndAmortisation) || 0;
    if (next.ebit !== null && next.ebit !== undefined) {
      next.ebitda = ebit + da;
    }
    // Auto-compute Total Debt
    const std = parseFloat(next.shortTermDebt);
    const ltd = parseFloat(next.longTermDebt);
    if (!isNaN(std) || !isNaN(ltd)) {
      next.totalDebt = (std || 0) + (ltd || 0);
    }
    onChange(next);
  }

  function handleNext() {
    if (!figures.revenue)          { setError("Revenue is required."); return; }
    if (!figures.totalAssets)      { setError("Total Assets is required."); return; }
    if (!figures.currentLiabilities){ setError("Current Liabilities is required."); return; }
    setError("");
    onNext();
  }

  const css = {
    card : { background:"#fff", border:"1px solid #E0E0E0", borderRadius:8, padding:20, marginBottom:16 },
    title: { fontSize:13, fontWeight:"bold", color:"#5A5A5A", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:14, paddingBottom:8, borderBottom:"1px solid #F0F0F0" },
    grid : { display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:12 },
  };

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12, flexWrap:"wrap", gap:8 }}>
        <div style={{ fontSize:13, color:"#5A5A5A" }}>Review all figures carefully before computing scores.</div>
        <div style={{ display:"flex", gap:8 }}>
          <span style={{ fontSize:11, padding:"3px 10px", borderRadius:999, background:"#EEF4FF", color:"#1A5276", border:"1px solid #9DBFEA" }}>Blue = AI extracted</span>
          <span style={{ fontSize:11, padding:"3px 10px", borderRadius:999, background:"#ecfdf5", color:"#065f46", border:"1px solid #6ee7b7" }}>Green = needs entry</span>
        </div>
      </div>

      {error && (
        <div style={{ padding:"10px 14px", borderRadius:6, fontSize:13, background:"#FCEBEB", color:"#791F1F", border:"1px solid #F09595", marginBottom:12 }}>
          {error}
        </div>
      )}

      {figures.auditorName && (
        <div style={{ padding:"8px 14px", borderRadius:6, fontSize:12, background:"#EEF4FF", color:"#1A5276", border:"1px solid #9DBFEA", marginBottom:12 }}>
          Auditor: <strong>{figures.auditorName}</strong>
          {figures.auditOpinion && <> &nbsp;·&nbsp; Opinion: <strong>{figures.auditOpinion}</strong></>}
          {figures.reportingPeriod && <> &nbsp;·&nbsp; Period: <strong>{figures.reportingPeriod}</strong></>}
        </div>
      )}

      <div style={css.card}>
        <div style={css.title}>Income Statement</div>
        <div style={css.grid}>
          <Field label="Revenue (₦'000)" id="revenue" figures={figures} onChange={set} />
          <Field label="Prior Year Revenue (₦'000)" id="priorYearRevenue" figures={figures} onChange={set} manual placeholder="Required for growth rate" />
          <Field label="Net Income (₦'000)" id="netIncome" figures={figures} onChange={set} />
          <Field label="EBIT (₦'000)" id="ebit" figures={figures} onChange={set} />
          <Field label="Depreciation & Amortisation (₦'000)" id="depreciationAndAmortisation" figures={figures} onChange={set} placeholder="From cash flow or notes" />
          <Field label="EBITDA (₦'000) — auto-computed" id="ebitda" figures={figures} onChange={set} readonly />
        </div>
      </div>

      <div style={css.card}>
        <div style={css.title}>Balance Sheet</div>
        <div style={css.grid}>
          <Field label="Cash & Equivalents (₦'000)" id="cash" figures={figures} onChange={set} />
          <Field label="Inventory (₦'000)" id="inventory" figures={figures} onChange={set} />
          <Field label="Prepaid Expenses (₦'000)" id="prepaidExpenses" figures={figures} onChange={set} />
          <Field label="Current Assets (₦'000)" id="currentAssets" figures={figures} onChange={set} />
          <Field label="Total Assets (₦'000)" id="totalAssets" figures={figures} onChange={set} />
          <Field label="Current Liabilities (₦'000)" id="currentLiabilities" figures={figures} onChange={set} />
          <Field label="Total Liabilities (₦'000)" id="totalLiabilities" figures={figures} onChange={set} />
          <Field label="Short-term Debt (₦'000)" id="shortTermDebt" figures={figures} onChange={set} />
          <Field label="Long-term Debt (₦'000)" id="longTermDebt" figures={figures} onChange={set} />
          <Field label="Total Debt (₦'000) — auto-computed" id="totalDebt" figures={figures} onChange={set} readonly />
          <Field label="Shareholders' Equity (₦'000)" id="shareholdersEquity" figures={figures} onChange={set} />
          <Field label="Retained Earnings (₦'000)" id="retainedEarnings" figures={figures} onChange={set} />
        </div>
      </div>

      <div style={css.card}>
        <div style={css.title}>Interest Rates</div>
        <div style={css.grid}>
          <Field label="Short-term debt rate (%)" id="shortTermInterestRate" figures={figures} onChange={set} step="0.1" placeholder="e.g. 13.5" manual />
          <Field label="Long-term debt rate (%)" id="longTermInterestRate" figures={figures} onChange={set} step="0.1" placeholder="e.g. 17.5" manual />
        </div>
        <div style={{ fontSize:11, color:"#888", marginTop:8 }}>Enter as percentage e.g. 13.5 for 13.5%. The scoring engine converts to decimal automatically.</div>
      </div>

      <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:20 }}>
        <button onClick={onBack} style={{ padding:"9px 20px", fontSize:13, borderRadius:6, cursor:"pointer", border:"1px solid #D0D0D0", background:"transparent", color:"#1F2854", fontFamily:"Arial,sans-serif" }}>Back</button>
        <button onClick={handleNext} style={{ padding:"9px 20px", fontSize:13, borderRadius:6, cursor:"pointer", border:"1px solid #1F2854", background:"#1F2854", color:"#fff", fontFamily:"Arial,sans-serif" }}>Compute Scores</button>
      </div>
    </div>
  );
}