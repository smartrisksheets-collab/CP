// First step of a loan or facility (D053): who is applying and what they ask for.
// Saved as figures.terms (backend/api/instruments.py LOAN_FIELDS); the repayment check
// (backend/api/repayment.py) reads the amount, tenor, rate, repayment and moratorium.
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useIsMobile } from "../../hooks/useBreakpoint.js";
import { REPAYMENT_TYPES } from "../../utils/instruments.js";

const css = {
  card : { background:"#fff", border:"1px solid #E0E0E0", borderRadius:8, padding:20, marginBottom:16 },
  title: { fontSize:13, fontWeight:"bold", color:"#5A5A5A", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:14, paddingBottom:8, borderBottom:"1px solid #F0F0F0" },
  label: { fontSize:12, color:"#5A5A5A", display:"block", marginBottom:4 },
  input: { width:"100%", padding:"8px 10px", fontSize:13, border:"1px solid #D8D8D8", borderRadius:6, background:"#fff", color:"#1F2854", fontFamily:"Arial,sans-serif", boxSizing:"border-box" },
  err  : { fontSize:11, color:"#A32D2D", marginTop:3 },
  btn  : { padding:"9px 20px", fontSize:13, borderRadius:6, cursor:"pointer", fontFamily:"Arial,sans-serif", display:"flex", alignItems:"center", justifyContent:"center", gap:6 },
};

// "₦500,000,000" or "22% a year" -> "500000000" / "22"
const numberIn = (v) => {
  const m = String(v ?? "").replace(/,/g, "").match(/\d+(\.\d+)?/);
  return m ? m[0] : "";
};
const withCommas = (digits) => {
  if (!digits) return "";
  const [whole, dec] = digits.split(".");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (dec !== undefined ? `.${dec}` : "");
};
const repaymentLabel = (v) => {
  const t = String(v || "").toLowerCase();
  const hit = REPAYMENT_TYPES.find(([code, label]) => t === code || t === label.toLowerCase());
  return hit ? hit[1] : REPAYMENT_TYPES[0][1];
};

export default function LoanRequest({ clientInfo, onClientInfoChange, figures, onFiguresChange, onNext }) {
  const isMobile = useIsMobile();
  const start = figures?.terms || clientInfo.terms || {};
  const [name, setName] = useState(clientInfo.clientName || "");
  const [f, setF] = useState(() => ({
    facilityType: start.facilityType || "",
    amount      : numberIn(start.amount),
    tenor       : numberIn(start.tenor),
    interestRate: numberIn(start.interestRate),
    repayment   : repaymentLabel(start.repayment),
    moratorium  : numberIn(start.moratorium),
    collateral  : start.collateral || "",
    guarantee   : start.guarantee || "",
    purpose     : start.purpose || "",
    covenants   : start.covenants || "",
  }));
  const [tried, setTried] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const errors = {
    name        : !name.trim() ? "Enter the applicant's name." : "",
    amount      : !(Number(f.amount) > 0) ? "Enter the amount requested." : "",
    tenor       : !(Number(f.tenor) >= 1) ? "Enter the tenor in months." : "",
    interestRate: f.interestRate === "" ? "Enter the interest rate." : Number(f.interestRate) > 100 ? "Enter the rate as a % a year, e.g. 22." : "",
    moratorium  : f.moratorium && Number(f.moratorium) >= Number(f.tenor) ? "The moratorium must be shorter than the tenor." : "",
  };
  const ok = !Object.values(errors).some(Boolean);

  function handleContinue() {
    setTried(true);
    if (!ok) return;
    const months = (n) => `${n} month${Number(n) === 1 ? "" : "s"}`;
    const terms = {
      facilityType: f.facilityType.trim() || null,
      amount      : `₦${withCommas(f.amount)}`,
      tenor       : months(f.tenor),
      interestRate: `${f.interestRate}% a year`,
      repayment   : f.repayment,
      moratorium  : f.moratorium && Number(f.moratorium) > 0 ? months(f.moratorium) : null,
      collateral  : f.collateral.trim() || null,
      guarantee   : f.guarantee.trim() || null,
      purpose     : f.purpose.trim() || null,
      covenants   : f.covenants.trim() || null,
    };
    onClientInfoChange({ ...clientInfo, clientName: name.trim(), instrument: "loan", terms });
    // After extraction the figures carry the terms too
    if (figures && Object.keys(figures).length) onFiguresChange({ ...figures, instrument: "loan", terms });
    onNext();
  }

  const g = (cols) => ({ display:"grid", gridTemplateColumns: isMobile ? "1fr" : cols, gap:12 });
  const field = (k, label, props = {}, suffix) => (
    <div>
      <label style={css.label} htmlFor={`sr-loan-${k}`}>{label}</label>
      <div style={{ position:"relative" }}>
        <input id={`sr-loan-${k}`} style={{ ...css.input, paddingRight: suffix ? 64 : 10 }} value={f[k]}
          onChange={(e) => set(k, e.target.value)} {...props} />
        {suffix && <span style={{ position:"absolute", right:10, top:9, fontSize:12, color:"#888" }}>{suffix}</span>}
      </div>
      {tried && errors[k] && <div style={css.err}>{errors[k]}</div>}
    </div>
  );

  return (
    <div>
      <div style={css.card}>
        <div style={css.title}>Applicant</div>
        <div style={g("minmax(0,2fr) minmax(0,1fr)")}>
          <div>
            <label style={css.label} htmlFor="sr-loan-name">Applicant name *</label>
            <input id="sr-loan-name" style={css.input} value={name} placeholder="e.g. Okomu Oil Palm Plc"
              onChange={(e) => setName(e.target.value)} />
            {tried && errors.name && <div style={css.err}>{errors.name}</div>}
          </div>
          {field("facilityType", "Facility type", { placeholder:"e.g. Term loan, overdraft" })}
        </div>
      </div>

      <div style={css.card}>
        <div style={css.title}>Facility Requested</div>
        <div style={g("minmax(0,1.4fr) repeat(2,minmax(0,1fr))")}>
          <div>
            <label style={css.label} htmlFor="sr-loan-amount">Amount *</label>
            <div style={{ position:"relative" }}>
              <span style={{ position:"absolute", left:10, top:8, fontSize:13, color:"#888" }}>₦</span>
              <input id="sr-loan-amount" inputMode="decimal" style={{ ...css.input, paddingLeft:24 }} placeholder="500,000,000"
                value={withCommas(f.amount)} onChange={(e) => set("amount", numberIn(e.target.value))} />
            </div>
            {tried && errors.amount && <div style={css.err}>{errors.amount}</div>}
          </div>
          {field("tenor", "Tenor *", { inputMode:"numeric", placeholder:"24" }, "months")}
          {field("interestRate", "Interest rate *", { inputMode:"decimal", placeholder:"22" }, "% a year")}
        </div>
        <div style={{ ...g("repeat(2,minmax(0,1fr))"), marginTop:12 }}>
          <div>
            <label style={css.label} htmlFor="sr-loan-repayment">Repayment</label>
            <select id="sr-loan-repayment" style={css.input} value={f.repayment} onChange={(e) => set("repayment", e.target.value)}>
              {REPAYMENT_TYPES.map(([code, label]) => <option key={code} value={label}>{label}</option>)}
            </select>
          </div>
          {field("moratorium", "Moratorium (interest only)", { inputMode:"numeric", placeholder:"0" }, "months")}
        </div>
        <div style={{ fontSize:11, color:"#888", marginTop:10 }}>
          The repayment check adds this facility's payments in its first 12 months to the debt the company already services.
        </div>
      </div>

      <div style={css.card}>
        <div style={css.title}>Security &amp; Purpose <span style={{ fontWeight:"normal", fontSize:11, color:"#888", textTransform:"none" }}>(optional)</span></div>
        <div style={g("repeat(2,minmax(0,1fr))")}>
          {field("collateral", "Collateral / security", { placeholder:"—" })}
          {field("guarantee", "Guarantee", { placeholder:"—" })}
          {field("purpose", "Purpose", { placeholder:"—" })}
          {field("covenants", "Key covenants", { placeholder:"—" })}
        </div>
      </div>

      <div style={{ display:"flex", justifyContent:"flex-end", marginTop:20 }}>
        <button onClick={handleContinue}
          style={{ ...css.btn, border:"none", background:"var(--accent)", color:"#fff", fontWeight:600, width: isMobile ? "100%" : "auto" }}>
          Continue to Statements <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
