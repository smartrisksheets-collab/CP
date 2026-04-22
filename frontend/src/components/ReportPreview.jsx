import { useState } from "react";
import { generateReport } from "../api/client.js";
import { X, Download, Loader } from "lucide-react";

const SECTIONS = [
  { key:"financialStandingReview", label:"Financial Standing",   ratingKey:"financialStanding" },
  { key:"cashFlowReview",          label:"Cash Flow",            ratingKey:"cashFlowRating" },
  { key:"creditRiskReview",        label:"Credit Risk",          ratingKey:"creditRiskLevel" },
  { key:"futureRisksReview",       label:"Future Risks",         ratingKey:"futureRiskLevel" },
  { key:"creditRatingReview",      label:"Credit Rating Context",ratingKey:null },
  { key:"recommendation",          label:"Recommendation",       ratingKey:null },
];

const RATING_OPTIONS = {
  financialStanding: ["Strong", "Fair", "Weak"],
  cashFlowRating   : ["Strong", "Moderate", "Weak"],
  creditRiskLevel  : ["Low", "Moderate", "High"],
  futureRiskLevel  : ["Low", "Moderate", "High"],
};

export default function ReportPreview({ assessmentId, narrative, clientInfo, scoreResult, onClose }) {
  const [edited, setEdited]       = useState({ ...narrative });
  const [downloading, setDownloading] = useState(false);
  const [error, setError]         = useState("");

  function setField(key, val) {
    setEdited((prev) => ({ ...prev, [key]: val }));
  }

  async function handleDownload() {
    setDownloading(true);
    setError("");
    try {
      const res = await generateReport(assessmentId);
      const url = URL.createObjectURL(new Blob([res.data], { type:"application/pdf" }));
      const a   = document.createElement("a");
      a.href    = url;
      a.download = `SmartRisk_${(clientInfo.clientName || "Report").replace(/\s+/g,"_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to generate PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  const css = {
    overlay : { position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:99999, display:"flex", alignItems:"center", justifyContent:"center", padding:24 },
    box     : { background:"#fff", borderRadius:12, width:"100%", maxWidth:720, maxHeight:"90vh", display:"flex", flexDirection:"column", boxShadow:"0 24px 80px rgba(0,0,0,0.3)" },
    header  : { padding:"20px 24px", borderBottom:"1px solid #E0E0E0", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 },
    body    : { overflowY:"auto", padding:"20px 24px", flex:1 },
    footer  : { padding:"16px 24px", borderTop:"1px solid #E0E0E0", display:"flex", gap:10, justifyContent:"flex-end", flexShrink:0 },
    section : { marginBottom:20 },
    label   : { fontSize:12, fontWeight:"bold", color:"#5A5A5A", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:6, display:"flex", alignItems:"center", gap:8 },
    select  : { fontSize:12, padding:"4px 8px", border:"1px solid #D0D0D0", borderRadius:5, color:"#1F2854", background:"#fff", cursor:"pointer" },
    textarea: { width:"100%", padding:"10px 12px", fontSize:13, border:"1px solid #D8D8D8", borderRadius:6, color:"#1F2854", fontFamily:"Arial,sans-serif", lineHeight:1.65, resize:"vertical", minHeight:90, boxSizing:"border-box" },
    btnGhost: { padding:"9px 18px", fontSize:13, borderRadius:6, cursor:"pointer", border:"1px solid #D0D0D0", background:"transparent", color:"#1F2854", fontFamily:"Arial,sans-serif" },
    btnAccent:{ padding:"9px 18px", fontSize:13, borderRadius:6, cursor:"pointer", border:"1px solid var(--accent)", background:"var(--accent)", color:"#fff", fontFamily:"Arial,sans-serif", display:"flex", alignItems:"center", gap:6 },
  };

  const eligible = scoreResult?.eligible;
  const score    = scoreResult?.total_score ?? 0;

  return (
    <div style={css.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={css.box}>

        {/* Header */}
        <div style={css.header}>
          <div>
            <div style={{ fontSize:16, fontWeight:"bold", color:"var(--primary)" }}>Preview & Edit Report</div>
            <div style={{ fontSize:12, color:"#888", marginTop:2 }}>
              {clientInfo.clientName} &nbsp;·&nbsp; Score: {score}/56 &nbsp;·&nbsp;
              <span style={{ color: eligible ? "#1E7E34" : "#A32D2D", fontWeight:"bold" }}>
                {eligible ? "Eligible" : "Not Eligible"}
              </span>
            </div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:"#888" }}>
            <X size={20} />
          </button>
        </div>

        {/* Body — editable sections */}
        <div style={css.body}>
          <div style={{ fontSize:12, color:"#888", marginBottom:16, padding:"8px 12px", background:"#F5F5F2", borderRadius:6 }}>
            Edit the narrative sections below before exporting. Changes are for this export only — they do not update the saved assessment.
          </div>

          {SECTIONS.map(({ key, label, ratingKey }) => (
            <div key={key} style={css.section}>
              <div style={css.label}>
                {label}
                {ratingKey && RATING_OPTIONS[ratingKey] && (
                  <select
                    style={css.select}
                    value={edited[ratingKey] || ""}
                    onChange={(e) => setField(ratingKey, e.target.value)}
                  >
                    {RATING_OPTIONS[ratingKey].map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                )}
              </div>
              <textarea
                style={css.textarea}
                value={edited[key] || ""}
                onChange={(e) => setField(key, e.target.value)}
                placeholder={`Enter ${label.toLowerCase()} narrative...`}
              />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={css.footer}>
          {error && (
            <div style={{ fontSize:12, color:"#791F1F", alignSelf:"center", flex:1 }}>{error}</div>
          )}
          <button style={css.btnGhost} onClick={onClose}>Cancel</button>
          <button style={css.btnAccent} onClick={handleDownload} disabled={downloading}>
            {downloading
              ? <><Loader size={14} style={{ animation:"spin 0.8s linear infinite" }} /> Generating...</>
              : <><Download size={14} /> Export PDF</>
            }
          </button>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}