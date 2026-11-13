// Repayment check for a loan and health report for a general review (D053).
// Both come from the server (backend/api/repayment.py, backend/api/health.py).

const card  = { background:"#fff", border:"1px solid #E0E0E0", borderRadius:8, padding:20, marginBottom:16 };
const title = { fontSize:13, fontWeight:"bold", color:"#5A5A5A", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:14, paddingBottom:8, borderBottom:"1px solid #F0F0F0" };
const th    = { fontSize:11, fontWeight:"bold", color:"#888", padding:"6px 8px", borderBottom:"2px solid #E8E8E8", textTransform:"uppercase", textAlign:"right", whiteSpace:"nowrap" };
const td    = { fontSize:13, padding:"8px", borderBottom:"1px solid #F0F0F0", textAlign:"right", color:"#333" };

import { TONE, overallTone, ratingTone } from "../utils/instruments.js";

const readingTone = (r) => TONE[{ "Within guide":"good", "Near guide":"mid" }[r] || "bad"];

const naira = (k) => (k == null ? "—" : `₦${Math.round(k * 1000).toLocaleString("en-NG")}`);
const times = (v) => (v == null ? "N/M" : `${v.toFixed(2)}x`);

function Pill({ text, tone }) {
  return <span style={{ fontSize:11, padding:"2px 8px", borderRadius:999, background:tone.bg, color:tone.fg, border:`1px solid ${tone.bd}`, whiteSpace:"nowrap", fontWeight:"bold" }}>{text}</span>;
}

export function RepaymentPanel({ check, onEditRequest }) {
  if (!check) return null;
  if (check.status !== "ok") {
    return (
      <div style={card}>
        <div style={title}>Repayment Check</div>
        <div style={{ fontSize:13, color:"#7A4F00", marginBottom: onEditRequest ? 10 : 0 }}>{check.message}</div>
        {onEditRequest && (
          <button onClick={onEditRequest} style={{ padding:"7px 14px", fontSize:12, borderRadius:6, cursor:"pointer", border:"1px solid #1F2854", background:"transparent", color:"#1F2854", fontFamily:"Arial,sans-serif" }}>
            Edit facility request
          </button>
        )}
      </div>
    );
  }
  const { facility: fac, firstYear: fy } = check;
  return (
    <div style={card} data-testid="repayment-panel">
      <div style={{ ...title, display:"flex", justifyContent:"space-between", alignItems:"center", gap:8 }}>
        <span>Repayment Check</span>
        <Pill text={check.overall} tone={overallTone(check.overall)} />
      </div>
      <div style={{ fontSize:13, color:"#5A5A5A", lineHeight:1.7, marginBottom:12 }}>
        ₦{Math.round(fac.amount).toLocaleString("en-NG")} over {fac.tenorMonths} months at {fac.ratePct}% a year, {fac.repaymentLabel.toLowerCase()}.
        {" "}Payments in the first 12 months: <strong style={{ color:"#1F2854" }}>{naira(fy.total)}</strong> (principal {naira(fy.principal)}, interest {naira(fy.interest)}).
      </div>
      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", minWidth:520 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign:"left" }}>Measure</th><th style={th}>Today</th><th style={th}>With facility</th><th style={th}>Guide</th><th style={th}>Reading</th>
            </tr>
          </thead>
          <tbody>
            {check.measures.map((m) => {
              const fmt = m.unit === "amount" ? naira : times;
              return (
                <tr key={m.id}>
                  <td style={{ ...td, textAlign:"left", color:"#1F2854" }}>{m.label.replace(" (N'000)", "")}</td>
                  <td style={td}>{fmt(m.today)}</td>
                  <td style={{ ...td, fontWeight:"bold", color:"#1F2854" }}>{fmt(m.withFacility)}</td>
                  <td style={{ ...td, color:"#888" }}>{m.guide || ""}</td>
                  <td style={td}>{m.reading && <Pill text={m.reading} tone={readingTone(m.reading)} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {(check.notes || []).map((n) => <div key={n} style={{ fontSize:12, color:"#888", marginTop:6 }}>{n}</div>)}
      <div style={{ fontSize:11, color:"#888", marginTop:8 }}>
        Debt service is the year's finance cost plus short-term debt, as in the DSCR. Guides are the scoring model's full-marks benchmarks.
      </div>
    </div>
  );
}

export function HealthPanel({ health }) {
  if (!health) return null;
  return (
    <div style={card} data-testid="health-panel">
      <div style={{ ...title, display:"flex", justifyContent:"space-between", alignItems:"center", gap:8 }}>
        <span>Financial Health</span>
        <Pill text={`${health.pct}% · ${health.rating}`} tone={ratingTone(health.rating)} />
      </div>
      <div style={{ display:"grid", gap:10 }}>
        {health.dimensions.map((d) => {
          const tone = ratingTone(d.rating);
          return (
            <div key={d.name} style={{ display:"grid", gridTemplateColumns:"110px 1fr 120px", gap:10, alignItems:"center" }}>
              <div style={{ fontSize:13, color:"#1F2854" }}>{d.name}</div>
              <div style={{ height:8, background:"#F0F0F0", borderRadius:4, overflow:"hidden" }}>
                <div style={{ width:`${Math.max(0, Math.min(100, d.pct))}%`, height:"100%", background:tone.bd }} />
              </div>
              <div style={{ fontSize:12, color:tone.fg, textAlign:"right", whiteSpace:"nowrap" }}>{d.pct}% · {d.rating}</div>
            </div>
          );
        })}
      </div>
      {(health.strengths.length > 0 || health.watch.length > 0) && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:14, marginTop:16 }}>
          <div>
            <div style={{ fontSize:11, fontWeight:"bold", color:"#27500A", textTransform:"uppercase", marginBottom:6 }}>Strengths</div>
            {health.strengths.length ? health.strengths.map((s) => <div key={s} style={{ fontSize:13, color:"#333", marginBottom:3 }}>✓ {s}</div>)
              : <div style={{ fontSize:12, color:"#888" }}>No ratio earns full marks.</div>}
          </div>
          <div>
            <div style={{ fontSize:11, fontWeight:"bold", color:"#791F1F", textTransform:"uppercase", marginBottom:6 }}>Watch points</div>
            {health.watch.length ? health.watch.map((s) => <div key={s} style={{ fontSize:13, color:"#333", marginBottom:3 }}>• {s}</div>)
              : <div style={{ fontSize:12, color:"#888" }}>No ratio is in its weak range.</div>}
          </div>
        </div>
      )}
      <div style={{ fontSize:11, color:"#888", marginTop:12 }}>
        Share of the scoring model's points earned. Strong is 75% or more, Fair 40% or more, Weak below. There is no pass mark for a general review.
      </div>
    </div>
  );
}
