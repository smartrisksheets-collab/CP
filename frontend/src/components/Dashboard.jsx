import { useEffect, useState } from "react";
import { getHistory, generateReport, getAssessment, updateNarrative } from "../api/client.js";
import { Loader, Download, Eye, X, Save } from "lucide-react";

export default function Dashboard() {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [downloading, setDownloading] = useState(null); // assessmentId being downloaded

  useEffect(() => {
    getHistory()
      .then((res) => setRows(res.data))
      .catch(() => setError("Failed to load history."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ textAlign:"center", padding:40 }}>
      <Loader size={24} style={{ animation:"spin 0.8s linear infinite", color:"var(--accent)" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      {viewing && <AssessmentModal data={viewing} onClose={() => setViewing(null)} onSaved={(updated) => setViewing(updated)} />}
    </div>
  );

  if (error) return <div style={{ color:"#791F1F", fontSize:13 }}>{error}</div>;

  if (!rows.length) return (
    <div style={{ fontSize:13, color:"#888", textAlign:"center", padding:24 }}>
      No past assessments yet. Complete your first assessment to see it here.
    </div>
  );

  const th = { textAlign:"left", fontSize:11, fontWeight:"bold", color:"#888", padding:"8px 10px", borderBottom:"2px solid #E8E8E8", textTransform:"uppercase" };
  const td = { padding:"10px", borderBottom:"1px solid #F0F0F0", fontSize:13 };

  const [viewing, setViewing]   = useState(null); // full assessment object
  const [loadingView, setLoadingView] = useState(null);

  async function handleView(r) {
    setLoadingView(r.id);
    try {
      const res = await getAssessment(r.id);
      setViewing(res.data);
    } catch {
      alert("Failed to load assessment.");
    } finally {
      setLoadingView(null);
    }
  }

  async function handleDownload(r) {
    setDownloading(r.id);
    try {
      const res = await generateReport(r.id);
      const url = URL.createObjectURL(new Blob([res.data], { type:"application/pdf" }));
      const a   = document.createElement("a");
      a.href    = url;
      a.download = `SmartRisk_${(r.clientName || "Report").replace(/\s+/g, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to generate report. Please try again.");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div style={{ overflowX:"auto" }}>
      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
        <thead>
          <tr>
            <th style={th}>Date</th>
            <th style={th}>Client</th>
            <th style={th}>Rating</th>
            <th style={{ ...th, textAlign:"right" }}>Score</th>
            <th style={th}>Verdict</th>
            <th style={{ ...th, textAlign:"center" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const eligible = r.eligible;
            return (
              <tr key={r.id}>
                <td style={td}>{new Date(r.createdAt).toLocaleDateString("en-NG", { day:"2-digit", month:"short", year:"numeric" })}</td>
                <td style={{ ...td, fontWeight:"bold", color:"var(--primary)" }}>{r.clientName || "—"}</td>
                <td style={td}>{r.creditRating || "—"}</td>
                <td style={{ ...td, textAlign:"right", fontWeight:"bold" }}>{r.totalScore} / 56</td>
                <td style={td}>
                  <span style={{
                    fontSize:11, padding:"2px 10px", borderRadius:999, fontWeight:"bold",
                    background: eligible ? "#EAF3DE" : "#FCEBEB",
                    color:      eligible ? "#27500A" : "#791F1F",
                    border:     `1px solid ${eligible ? "#97C459" : "#F09595"}`,
                  }}>
                    {eligible ? "Eligible" : "Not Eligible"}
                  </span>
                </td>
                <td style={{ ...td, textAlign:"center" }}>
                  <div style={{ display:"flex", gap:6, justifyContent:"center" }}>
                    <button onClick={() => handleView(r)} disabled={!!loadingView}
                      title="View & edit assessment"
                      style={{ background:"none", border:"1px solid #D0D0D0", borderRadius:5, padding:"4px 8px", cursor:"pointer", color:"var(--primary)", display:"inline-flex", alignItems:"center", gap:4, fontSize:11 }}>
                      {loadingView === r.id ? <Loader size={12} style={{ animation:"spin 0.8s linear infinite" }} /> : <Eye size={12} />}
                      View
                    </button>
                    <button onClick={() => handleDownload(r)} disabled={!!downloading}
                      title="Download PDF report"
                      style={{ background:"none", border:"1px solid #D0D0D0", borderRadius:5, padding:"4px 8px", cursor:"pointer", color:"var(--primary)", display:"inline-flex", alignItems:"center", gap:4, fontSize:11, opacity: downloading && downloading !== r.id ? 0.4 : 1 }}>
                      {downloading === r.id ? <Loader size={12} style={{ animation:"spin 0.8s linear infinite" }} /> : <Download size={12} />}
                      PDF
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
const NARR_LABELS = [
  ["financialStandingReview", "Financial Standing"],
  ["cashFlowReview",          "Cash Flow"],
  ["creditRiskReview",        "Credit Risk"],
  ["futureRisksReview",       "Future Risks"],
  ["creditRatingReview",      "Credit Rating"],
  ["recommendation",          "Recommendation"],
];

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

function AssessmentModal({ data, onClose, onSaved }) {
  const [narr, setNarr]     = useState(data.narrative || {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [dlBusy, setDlBusy] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await updateNarrative(data.id, narr);
      setSaved(true);
      onSaved({ ...data, narrative: narr });
      setTimeout(() => setSaved(false), 2000);
    } catch {
      alert("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDownload() {
    setDlBusy(true);
    try {
      const res = await generateReport(data.id);
      const url = URL.createObjectURL(new Blob([res.data], { type:"application/pdf" }));
      const a   = document.createElement("a");
      a.href    = url;
      a.download = `SmartRisk_${(data.clientName || "Report").replace(/\s+/g,"_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to generate PDF.");
    } finally {
      setDlBusy(false);
    }
  }

  const th = { textAlign:"left", fontSize:11, fontWeight:"bold", color:"#888", padding:"7px 10px", borderBottom:"2px solid #E8E8E8", textTransform:"uppercase" };
  const td = { padding:"9px 10px", borderBottom:"1px solid #F0F0F0", fontSize:13, verticalAlign:"middle" };

  let lastCat = "";
  const ratioRows = (data.ratios || []).map((r, i) => {
    const cat    = CATEGORIES[r.id] || r.category || "";
    const newCat = cat !== lastCat;
    lastCat = cat;
    const green = r.score === r.max_score;
    const red   = r.score <= 0;
    const col   = green ? "#1E7E34" : red ? "#A32D2D" : "#065f46";
    const bg    = green ? "#EAF3DE" : red ? "#FCEBEB" : "#d1fae5";
    return (
      <>
        {newCat && <tr key={`c${i}`}><td colSpan={5} style={{ background:"var(--primary)", color:"#fff", fontSize:11, fontWeight:"bold", padding:"5px 10px", textTransform:"uppercase", letterSpacing:"0.04em" }}>{cat}</td></tr>}
        <tr key={i}>
          <td style={td}>{r.name}</td>
          <td style={td}>{r.display_value}</td>
          <td style={td}><span style={{ fontSize:11, padding:"2px 8px", borderRadius:999, background:bg, color:col, whiteSpace:"nowrap" }}>{r.band}</span></td>
          <td style={{ ...td, textAlign:"right", fontWeight:"bold", color:col }}>{r.score}</td>
          <td style={{ ...td, textAlign:"right", color:"#888" }}>{r.max_score}</td>
        </tr>
      </>
    );
  });

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
         style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ background:"#fff", borderRadius:12, width:"100%", maxWidth:780, maxHeight:"90vh", overflowY:"auto", padding:"32px 36px", position:"relative", boxShadow:"0 24px 80px rgba(0,0,0,0.25)" }}>
        <button onClick={onClose} style={{ position:"absolute", top:14, right:18, background:"none", border:"none", cursor:"pointer", color:"#888" }}><X size={18} /></button>

        <h2 style={{ fontSize:18, fontWeight:"bold", color:"var(--primary)", marginBottom:4 }}>{data.clientName}</h2>
        <div style={{ fontSize:12, color:"#888", marginBottom:20 }}>{new Date(data.createdAt).toLocaleDateString("en-NG", { day:"2-digit", month:"short", year:"numeric" })} · {data.creditRating || "No external rating"}</div>

        {/* Verdict */}
        <div style={{ borderRadius:8, padding:"16px 20px", textAlign:"center", marginBottom:20, background: data.eligible ? "#EAF3DE" : "#FCEBEB", border:`1px solid ${data.eligible ? "#97C459" : "#F09595"}` }}>
          <div style={{ fontSize:20, fontWeight:"bold", color: data.eligible ? "#27500A" : "#791F1F" }}>{data.eligible ? "ELIGIBLE" : "NOT ELIGIBLE"}</div>
          <div style={{ fontSize:13, color:"#5A5A5A", marginTop:4 }}>Score: {data.totalScore} / {data.maxScore} — {data.eligible ? "Meets" : "Below"} the 34-point threshold</div>
        </div>

        {/* Scores */}
        {data.ratios?.length > 0 && (
          <div style={{ marginBottom:24 }}>
            <div style={{ fontSize:13, fontWeight:"bold", color:"#5A5A5A", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:10, paddingBottom:6, borderBottom:"1px solid #F0F0F0" }}>Score Breakdown</div>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                <thead><tr>
                  <th style={th}>Ratio</th><th style={th}>Result</th><th style={th}>Band</th>
                  <th style={{ ...th, textAlign:"right" }}>Score</th><th style={{ ...th, textAlign:"right" }}>Max</th>
                </tr></thead>
                <tbody>{ratioRows}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* Narrative edit */}
        <div style={{ fontSize:13, fontWeight:"bold", color:"#5A5A5A", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:12, paddingBottom:6, borderBottom:"1px solid #F0F0F0" }}>Risk Narrative — Edit &amp; Save</div>
        {NARR_LABELS.map(([key, label]) => (
          <div key={key} style={{ marginBottom:14 }}>
            <label style={{ fontSize:11, fontWeight:"bold", color:"#888", textTransform:"uppercase", letterSpacing:"0.05em", display:"block", marginBottom:5 }}>{label}</label>
            <textarea
              value={narr[key] || ""}
              onChange={e => setNarr(p => ({ ...p, [key]: e.target.value }))}
              rows={3}
              style={{ width:"100%", padding:"8px 10px", fontSize:13, border:"1px solid #D8D8D8", borderRadius:6, fontFamily:"Arial,sans-serif", color:"#1F2854", resize:"vertical", lineHeight:1.5, boxSizing:"border-box" }}
            />
          </div>
        ))}

        {/* Actions */}
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:8 }}>
          <button onClick={handleSave} disabled={saving}
            style={{ padding:"9px 20px", fontSize:13, borderRadius:6, cursor: saving ? "not-allowed" : "pointer", border:"1px solid var(--primary)", background:"transparent", color:"var(--primary)", fontFamily:"Arial,sans-serif", display:"flex", alignItems:"center", gap:6 }}>
            {saving ? <Loader size={13} style={{ animation:"spin 0.8s linear infinite" }} /> : <Save size={13} />}
            {saved ? "Saved ✓" : saving ? "Saving…" : "Save Narrative"}
          </button>
          <button onClick={handleDownload} disabled={dlBusy}
            style={{ padding:"9px 20px", fontSize:13, borderRadius:6, cursor: dlBusy ? "not-allowed" : "pointer", border:"none", background:"var(--accent)", color:"#fff", fontFamily:"Arial,sans-serif", fontWeight:600, display:"flex", alignItems:"center", gap:6 }}>
            {dlBusy ? <Loader size={13} style={{ animation:"spin 0.8s linear infinite" }} /> : <Download size={13} />}
            {dlBusy ? "Generating…" : "Download PDF"}
          </button>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}