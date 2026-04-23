import { useState } from "react";
import { generateReport } from "../../api/client.js";
import { Download, Loader, Plus, Eye } from "lucide-react";
import ReportPreview from "../ReportPreview.jsx";

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

const CATEGORIES = {
  "quick_ratio"      : "Quick Ratios",
  "net_income_margin": "Profitability Ratios",
  "revenue_growth"   : "Profitability Ratios",
  "return_on_assets" : "Return Ratios",
  "debt_to_assets"   : "Leverage Ratios",
  "debt_to_capital"  : "Leverage Ratios",
  "interest_coverage": "Coverage Ratios",
  "dscr"             : "Coverage Ratios",
  "debt_to_ebitda"   : "Coverage Ratios",
  "altman_z"         : "Corporate Bankruptcy",
};

export default function Result({ scoreResult, assessmentId, narrative, clientInfo, onBack, onNew }) {
  const [downloading, setDownloading] = useState(false);
  const [dlError, setDlError]         = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const eligible = scoreResult?.eligible;
  const score    = scoreResult?.total_score ?? 0;
  const ratios   = scoreResult?.ratios ?? [];
  const n        = narrative || {};

  async function handleDownload() {
    setDownloading(true);
    setDlError("");
    try {
      const res = await generateReport(assessmentId);
      const url = URL.createObjectURL(new Blob([res.data], { type:"application/pdf" }));
      const a   = document.createElement("a");
      a.href    = url;
      a.download = `SmartRisk_${(clientInfo.clientName || "Report").replace(/\s+/g,"_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setDlError("Failed to generate PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  const css = {
    card  : { background:"#fff", border:"1px solid #E0E0E0", borderRadius:8, padding:20, marginBottom:16 },
    title : { fontSize:13, fontWeight:"bold", color:"#5A5A5A", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:14, paddingBottom:8, borderBottom:"1px solid #F0F0F0" },
    th    : { textAlign:"left", fontSize:11, fontWeight:"bold", color:"#888", padding:"8px 10px", borderBottom:"2px solid #E8E8E8", textTransform:"uppercase" },
    td    : { padding:"10px", borderBottom:"1px solid #F0F0F0", verticalAlign:"middle" },
    cat   : { background:"var(--primary)", color:"#fff", fontSize:11, fontWeight:"bold", padding:"5px 10px", textTransform:"uppercase", letterSpacing:"0.04em" },
    metric: { background:"#F5F5F2", borderRadius:6, padding:14, flex:1 },
  };

  let lastCat = "";
  const ratioRows = ratios.map((r, i) => {
    const cat    = CATEGORIES[r.id] || r.category || "";
    const newCat = cat !== lastCat;
    lastCat = cat;
    const col = scoreColor(r.score, r.max_score);
    const bg  = scoreBg(r.score, r.max_score);

    return (
      <>
        {newCat && <tr key={`cat-${i}`}><td colSpan={4} style={css.cat}>{cat}</td></tr>}
        <tr key={i}>
          <td style={css.td}>{r.name}</td>
          <td style={css.td}>{r.display_value}</td>
          <td style={css.td}>
            <span style={{ fontSize:11, padding:"2px 8px", borderRadius:999, background:bg, color:col, whiteSpace:"nowrap" }}>
              {r.band}
            </span>
          </td>
          <td style={{ ...css.td, textAlign:"right", fontWeight:"bold", color:col }}>{r.score}</td>
          <td style={{ ...css.td, textAlign:"right", color:"#888" }}>{r.max_score}</td>
        </tr>
      </>
    );
  });

  function NarrSection({ label, rating, review, ratingColor }) {
    if (!review) return null;
    const col = ratingColor || "#5A5A5A";
    return (
      <div style={{ marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
          <span style={{ fontSize:11, fontWeight:"bold", color:"#888", textTransform:"uppercase", letterSpacing:"0.05em" }}>{label}</span>
          {rating && <span style={{ fontSize:11, padding:"2px 8px", borderRadius:999, background:"#EEF4FF", color:col, border:"1px solid #9DBFEA" }}>{rating}</span>}
        </div>
        <p style={{ fontSize:13, lineHeight:1.7, color:"#333" }}>{review}</p>
      </div>
    );
  }

  const ratingCol = (r) => {
    if (!r) return "#5A5A5A";
    if (["Strong","Low"].includes(r))    return "#1E7E34";
    if (["Fair","Moderate"].includes(r)) return "#854F0B";
    return "#A32D2D";
  };

  return (
    <div>
      {/* Verdict */}
      <div style={{
        borderRadius:8, padding:20, textAlign:"center", marginBottom:16,
        background: eligible ? "#EAF3DE" : "#FCEBEB",
        border: `1px solid ${eligible ? "#97C459" : "#F09595"}`,
      }}>
        <div style={{ fontSize:22, fontWeight:"bold", color: eligible ? "#27500A" : "#791F1F" }}>
          {eligible ? "ELIGIBLE" : "NOT ELIGIBLE"}
        </div>
        <div style={{ fontSize:13, marginTop:6, color:"#5A5A5A" }}>
          Score: {score} / 56 — {eligible ? "Meets" : "Below"} the 34-point (60%) threshold
        </div>
      </div>

      {/* Metrics */}
      <div style={{ display:"flex", gap:10, marginBottom:16, flexWrap:"wrap" }}>
        <div style={css.metric}><div style={{ fontSize:11, color:"#888", marginBottom:6, textTransform:"uppercase" }}>Total Score</div><div style={{ fontSize:22, fontWeight:"bold", color:"var(--primary)" }}>{score}</div></div>
        <div style={css.metric}><div style={{ fontSize:11, color:"#888", marginBottom:6, textTransform:"uppercase" }}>Max Score</div><div style={{ fontSize:22, fontWeight:"bold", color:"var(--primary)" }}>56</div></div>
        <div style={css.metric}><div style={{ fontSize:11, color:"#888", marginBottom:6, textTransform:"uppercase" }}>Cut-off</div><div style={{ fontSize:22, fontWeight:"bold", color:"var(--primary)" }}>60%</div></div>
      </div>

      {/* Score breakdown */}
      <div style={css.card}>
        <div style={css.title}>Score Breakdown</div>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
          <thead>
            <tr>
              <th style={css.th}>Ratio</th>
              <th style={css.th}>Result</th>
              <th style={css.th}>Band</th>
              <th style={{ ...css.th, textAlign:"right" }}>Score</th>
              <th style={{ ...css.th, textAlign:"right" }}>Max</th>
            </tr>
          </thead>
          <tbody>{ratioRows}</tbody>
        </table>
      </div>

      {/* Narrative */}
      {(n.financialStandingReview || n.cashFlowReview) && (
        <div style={css.card}>
          <div style={css.title}>Risk Analysis Narrative</div>
          <NarrSection label="Financial Standing" rating={n.financialStanding} review={n.financialStandingReview} ratingColor={ratingCol(n.financialStanding)} />
          <NarrSection label="Cash Flow"          rating={n.cashFlowRating}    review={n.cashFlowReview}          ratingColor={ratingCol(n.cashFlowRating)} />
          <NarrSection label="Credit Risk"        rating={n.creditRiskLevel}   review={n.creditRiskReview}        ratingColor={ratingCol(n.creditRiskLevel)} />
          <NarrSection label="Future Risks"       rating={n.futureRiskLevel}   review={n.futureRisksReview}       ratingColor={ratingCol(n.futureRiskLevel)} />
          <NarrSection label="Credit Rating"      rating={null}                review={n.creditRatingReview} />
        </div>
      )}

      {/* Recommendation */}
      {n.recommendation && (
        <div style={css.card}>
          <div style={css.title}>Recommendation</div>
          <p style={{ fontSize:13, lineHeight:1.7, color:"#333" }}>{n.recommendation}</p>
        </div>
      )}

      {dlError && (
        <div style={{ padding:"10px 14px", borderRadius:6, fontSize:13, background:"#FCEBEB", color:"#791F1F", border:"1px solid #F09595", marginBottom:12 }}>
          {dlError}
        </div>
      )}

      <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:20, flexWrap:"wrap" }}>
        <button onClick={onBack} style={{ padding:"9px 20px", fontSize:13, borderRadius:6, cursor:"pointer", border:"1px solid #D0D0D0", background:"transparent", color:"#1F2854", fontFamily:"Arial,sans-serif" }}>
          Back to Scores
        </button>
        <button onClick={() => setShowPreview(true)} style={{ padding:"9px 20px", fontSize:13, borderRadius:6, cursor:"pointer", border:"1px solid #1F2854", background:"transparent", color:"#1F2854", fontFamily:"Arial,sans-serif", display:"flex", alignItems:"center", gap:6 }}>
          <Eye size={14} /> Preview & Edit
        </button>
        <button onClick={handleDownload} disabled={downloading} style={{ padding:"9px 20px", fontSize:13, borderRadius:6, cursor: downloading ? "not-allowed" : "pointer", border:"1px solid var(--accent)", background:"var(--accent)", color:"#fff", fontFamily:"Arial,sans-serif", display:"flex", alignItems:"center", gap:6 }}>
          {downloading ? <Loader size={14} style={{ animation:"spin 0.8s linear infinite" }} /> : <Download size={14} />}
          {downloading ? "Generating PDF..." : "Export Report"}
        </button>
        <button onClick={onNew} style={{ padding:"9px 20px", fontSize:13, borderRadius:6, cursor:"pointer", border:"1px solid #1F2854", background:"#1F2854", color:"#fff", fontFamily:"Arial,sans-serif", display:"flex", alignItems:"center", gap:6 }}>
          <Plus size={14} /> New Assessment
        </button>
      </div>
      {showPreview && (
        <ReportPreview
          assessmentId={assessmentId}
          narrative={narrative}
          clientInfo={clientInfo}
          scoreResult={scoreResult}
          onClose={() => setShowPreview(false)}
        />
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}