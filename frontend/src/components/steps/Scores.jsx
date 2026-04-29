import { useState, useEffect } from "react";
import { runAssessment } from "../../api/client.js";
import { Loader } from "lucide-react";

function scoreColor(score, max) {
  if (score === max) return "#1E7E34";
  if (score <= 0)    return "#A32D2D";
  return "#065f46";
}
function scoreBg(score, max) {
  if (score === max) return "#EAF3DE";
  if (score <= 0)    return "#FCEBEB";
  return "#d1fae5";
}

// Client-side scoring — mirrors backend exactly, used for preview only
function computeLocal(f) {
  function n(v) { return parseFloat(v) || 0; }

  const ratios = [];

  // Convert interest rates: if > 1 assume percentage, convert to decimal
  const stRate = n(f.shortTermInterestRate) > 1 ? n(f.shortTermInterestRate) / 100 : n(f.shortTermInterestRate);
  const ltRate = n(f.longTermInterestRate)  > 1 ? n(f.longTermInterestRate)  / 100 : n(f.longTermInterestRate);

  const td = n(f.shortTermDebt) + n(f.longTermDebt);

  const checks = [
    { name:"Acid-Test Ratio",           max:2,  val:(n(f.cash)+n(f.inventory)-n(f.prepaidExpenses))/Math.max(n(f.currentLiabilities),1), fmt:(v)=>v.toFixed(2)+"x", band:(v)=>v<1?"< 1x":v<=1.5?"1 - 1.5x":"> 1.5x", score:(v)=>v<1?-2:v<=1.5?1:2 },
    { name:"Net Income Margin",         max:4,  val:(n(f.netIncome)/Math.max(n(f.revenue),1))*100,   fmt:(v)=>v.toFixed(1)+"%", band:(v)=>v<10?"< 10%":v<=15?"10.1-15%":v<=20?"15.1-20%":"> 20%",      score:(v)=>v<10?0:v<=15?2:v<=20?3:4 },
    { name:"Revenue Growth Rate",       max:5,  val:n(f.priorYearRevenue)>0?((n(f.revenue)-n(f.priorYearRevenue))/n(f.priorYearRevenue))*100:null, fmt:(v)=>v===null?"N/A":v.toFixed(1)+"%", band:(v)=>v===null?"N/A":v<0?"Negative":v<=5?"0-5%":v<=15?"6-15%":v<=30?"16-30%":"> 30%", score:(v)=>v===null?0:v<0?-3:v<=5?1:v<=15?2:v<=30?3:5 },
    { name:"Return on Assets",          max:5,  val:(n(f.netIncome)/Math.max(n(f.totalAssets),1))*100, fmt:(v)=>v.toFixed(1)+"%", band:(v)=>v<10?"< 10%":v<=15?"10.1-15%":v<=20?"15.1-20%":v<=30?"20.1-30%":"> 30%", score:(v)=>v<10?1:v<=15?2:v<=20?3:v<=30?4:5 },
    { name:"Debt to Asset Ratio",       max:5,  val:(td/Math.max(n(f.totalAssets),1))*100,   fmt:(v)=>v.toFixed(1)+"%", band:(v)=>v<30?"< 30%":v<=50?"30.1-50%":v<=75?"50.1-75%":v<=100?"75.1-100%":"> 100%", score:(v)=>v<30?5:v<=50?3:v<=75?2:v<=100?0:-5 },
    { name:"Debt to Capital Ratio",     max:5,  val:(td/Math.max(td+n(f.shareholdersEquity),1))*100, fmt:(v)=>v.toFixed(1)+"%", band:(v)=>v<30?"< 30%":v<=50?"30.1-50%":v<=75?"50.1-75%":v<=100?"75.1-100%":"> 100%", score:(v)=>v<30?5:v<=50?2:v<=75?1:v<=100?0:-5 },
    { name:"Interest Coverage Ratio",   max:6,  val:(()=>{ const int=(n(f.shortTermDebt)*stRate)+(n(f.longTermDebt)*ltRate); return int>0?n(f.ebit)/int:999; })(), fmt:(v)=>v===999?"N/A":v.toFixed(2)+"x", band:(v)=>v===999?"No debt":v<1?"< 1.0x":v<=1.5?"1.0-1.5x":v<=3?"1.6-3.0x":v<=5?"3.1-5.0x":"> 5.0x", score:(v)=>v===999?6:v<1?-5:v<=1.5?2:v<=3?4:v<=5?5:6 },
    { name:"Debt Service Coverage",     max:7,  val:td>0?n(f.ebitda)/td:0, fmt:(v)=>v.toFixed(2)+"x", band:(v)=>v<0.5?"< 0.5x":v<=1?"0.6-1.0x":v<=3.5?"1.1-3.5x":v<=4?"3.6-4.0x":"> 4.1x", score:(v)=>v<0.5?7:v<=1?4:v<=3.5?3:v<=4?2:-5 },
    { name:"Debt to EBITDA",            max:7,  val:n(f.ebitda)>0?(td-n(f.cash))/n(f.ebitda):0, fmt:(v)=>v.toFixed(2)+"x", band:(v)=>v<2?"< 2x":v<=3?"2.1-3.0x":v<=3.5?"3.1-3.5x":v<=4?"3.6-4.0x":"> 4.1x", score:(v)=>v<2?7:v<=3?3:v<=3.5?2:v<=4?0:-5 },
    { name:"Altman Z-Score",            max:10, val:(()=>{ const ta=Math.max(n(f.totalAssets),1); const wc=n(f.currentAssets)-n(f.currentLiabilities); return 1.2*(wc/ta)+1.4*(n(f.retainedEarnings)/ta)+3.3*(n(f.ebit)/ta)+0.6*(n(f.shareholdersEquity)/Math.max(n(f.totalLiabilities),1))+1.0*(n(f.revenue)/ta); })(), fmt:(v)=>v.toFixed(2), band:(v)=>v<1.8?"< 1.8":v<=2.9?"1.8-2.9":"> 3", score:(v)=>v<1.8?-10:v<=2.9?5:10 },
  ];

  let total = 0;
  for (const c of checks) {
    const v  = c.val;
    const sc = c.score(v);
    total += sc;
    ratios.push({ name:c.name, max:c.max, displayValue:c.fmt(v), band:c.band(v), score:sc });
  }

  return { ratios, total, max:56, eligible: total >= 34 };
}

const CATEGORIES = {
  "Acid-Test Ratio"        : "Quick Ratios",
  "Net Income Margin"      : "Profitability Ratios",
  "Revenue Growth Rate"    : "Profitability Ratios",
  "Return on Assets"       : "Return Ratios",
  "Debt to Asset Ratio"    : "Leverage Ratios",
  "Debt to Capital Ratio"  : "Leverage Ratios",
  "Interest Coverage Ratio": "Coverage Ratios",
  "Debt Service Coverage"  : "Coverage Ratios",
  "Debt to EBITDA"         : "Coverage Ratios",
  "Altman Z-Score"         : "Corporate Bankruptcy",
};

export default function Scores({ figures, scoreResult, onScored, onBack, onNext, onQuotaExceeded, clientInfo }) {
  const [local]    = useState(() => computeLocal(figures));
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  async function handleViewResult() {
    setLoading(true);
    setError("");

    // Convert interest rates to decimal for backend if entered as percentage
    const f = { ...figures };
    if (f.shortTermInterestRate > 1) f.shortTermInterestRate = f.shortTermInterestRate / 100;
    if (f.longTermInterestRate  > 1) f.longTermInterestRate  = f.longTermInterestRate  / 100;

    try {
      const res = await runAssessment(f, clientInfo);
      const d   = res.data;
      onNext(
        { ratios: d.ratios, total_score: d.totalScore, eligible: d.eligible, max_score: d.maxScore },
        d.assessmentId,
        d.narrative,
      );
    } catch (e) {
      const detail = e.response?.data?.detail;
      if (detail?.quotaExceeded) {
        onQuotaExceeded?.(`You've used ${detail.used} of your ${detail.limit} assessments this month.`);
      } else {
        setError(typeof detail === "string" ? detail : "Failed to run assessment. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  const css = {
    card : { background:"#fff", border:"1px solid #E0E0E0", borderRadius:8, padding:20, marginBottom:16 },
    th   : { textAlign:"left", fontSize:11, fontWeight:"bold", color:"#888", padding:"8px 10px", borderBottom:"2px solid #E8E8E8", textTransform:"uppercase" },
    td   : { padding:"10px", borderBottom:"1px solid #F0F0F0", verticalAlign:"middle" },
    cat  : { background:"var(--primary)", color:"#fff", fontSize:11, fontWeight:"bold", padding:"5px 10px", textTransform:"uppercase", letterSpacing:"0.04em" },
  };

  let lastCat = "";
  const rows = local.ratios.map((r, i) => {
    const cat  = CATEGORIES[r.name] || "";
    const newCat = cat !== lastCat;
    lastCat = cat;
    const col = scoreColor(r.score, r.max);
    const bg  = scoreBg(r.score, r.max);

    return (
      <>
        {newCat && (
          <tr key={`cat-${i}`}><td colSpan={5} style={css.cat}>{cat}</td></tr>
        )}
        <tr key={i}>
          <td style={css.td}>{r.name}</td>
          <td style={css.td}>{r.displayValue}</td>
          <td style={css.td}>
            <span style={{ fontSize:11, padding:"2px 8px", borderRadius:999, background:bg, color:col, whiteSpace:"nowrap" }}>
              {r.band}
            </span>
          </td>
          <td style={{ ...css.td, textAlign:"right", fontWeight:"bold", color:col }}>{r.score}</td>
          <td style={{ ...css.td, textAlign:"right", color:"#888" }}>{r.max}</td>
        </tr>
      </>
    );
  });

  return (
    <div>
      <div style={{ fontSize:13, color:"#5A5A5A", marginBottom:14 }}>
        Client: <strong>{clientInfo.clientName}</strong> &nbsp;·&nbsp; Preview scores below. Click <em>View Result</em> to run the full AI assessment.
      </div>

      {error && (
        <div style={{ padding:"10px 14px", borderRadius:6, fontSize:13, background:"#FCEBEB", color:"#791F1F", border:"1px solid #F09595", marginBottom:12 }}>
          {error}
        </div>
      )}

      <div style={{ ...css.card, overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13, minWidth:480 }}>
          <thead>
            <tr>
              <th style={css.th}>Ratio</th>
              <th style={css.th}>Result</th>
              <th style={css.th}>Band</th>
              <th style={{ ...css.th, textAlign:"right" }}>Score</th>
              <th style={{ ...css.th, textAlign:"right" }}>Max</th>
            </tr>
          </thead>
          <tbody>
            {rows}
            <tr style={{ background:"#F5F5F2" }}>
              <td colSpan={3} style={{ ...css.td, fontWeight:"bold" }}>TOTAL (preview)</td>
              <td style={{ ...css.td, textAlign:"right", fontWeight:"bold", color: local.eligible ? "#1E7E34" : "#A32D2D" }}>{local.total}</td>
              <td style={{ ...css.td, textAlign:"right", color:"#888" }}>56</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:20 }}>
        <button onClick={onBack} style={{ padding:"9px 20px", fontSize:13, borderRadius:6, cursor:"pointer", border:"1px solid #D0D0D0", background:"transparent", color:"#1F2854", fontFamily:"Arial,sans-serif" }}>Back</button>
        <button onClick={handleViewResult} disabled={loading} style={{ padding:"9px 20px", fontSize:13, borderRadius:6, cursor: loading ? "not-allowed" : "pointer", border:"1px solid #1F2854", background: loading ? "#888" : "#1F2854", color:"#fff", fontFamily:"Arial,sans-serif", display:"flex", alignItems:"center", gap:6 }}>
          {loading && <Loader size={14} style={{ animation:"spin 0.8s linear infinite" }} />}
          {loading ? "Running assessment..." : "View Result"}
        </button>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}