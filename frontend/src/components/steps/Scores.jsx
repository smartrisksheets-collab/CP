import { useState, useEffect } from "react";
import { useIsMobile } from "../../hooks/useBreakpoint.js";
import { runAssessment, previewScores, errorMessage } from "../../api/client.js";
import RatioTable from "../RatioTable.jsx";
import { Loader, Zap, ChevronRight } from "lucide-react";

const RUN_MESSAGES = [
  "Validating figures…",
  "Computing ratios…",
  "Running scoring model…",
  "Generating risk narrative…",
  "Finalising assessment…",
];

// Rates are always typed as a percentage (13.5 = 13.5%, 0.8 = 0.8%); the engine divides by 100
function toEngineFigures(figures) {
  return { ...figures, rateUnit:"percent" };
}

function makeFiguresKey(figures) {
  return JSON.stringify(Object.entries(figures).sort());
}

export default function Scores({ figures, extractedFigures, scoreResult, scoredFiguresKey, onBack, onNext, onQuotaExceeded, clientInfo, draftId }) {
  const isMobile  = useIsMobile(640);
  const [preview, setPreview]     = useState(null);
  const [previewErr, setPreviewErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [msgIdx, setMsgIdx]   = useState(0);

  const currentKey   = makeFiguresKey(figures);
  const hasResult    = !!scoreResult;
  const figuresMatch = scoredFiguresKey === currentKey;
  const canProceed   = hasResult && figuresMatch;

  // Preview comes from the server engine, so it always matches the saved result
  useEffect(() => {
    let active = true;
    previewScores(toEngineFigures(figures))
      .then(res => { if (active) setPreview(res.data); })
      .catch(() => { if (active) setPreviewErr("Could not load the score preview. You can still run the assessment."); });
    return () => { active = false; };
  }, [currentKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!loading) return; // handleViewResult resets msgIdx before each run
    const t = setInterval(() => setMsgIdx(i => Math.min(i + 1, RUN_MESSAGES.length - 1)), 7000);
    return () => clearInterval(t);
  }, [loading]);

  async function handleViewResult() {
    setLoading(true);
    setError("");
    setMsgIdx(0);

    const f = toEngineFigures(figures);

    try {
      const res = await runAssessment(f, clientInfo, extractedFigures, draftId);
      const d   = res.data;
      onNext(
        { ratios: d.ratios, total_score: d.totalScore, eligible: d.eligible, max_score: d.maxScore, cutoff: d.cutoff, model_version: d.modelVersion },
        d.assessmentId,
        d.narrative,
        currentKey,
      );
    } catch (e) {
      const detail = e.response?.data?.detail;
      if (detail?.quotaExceeded) {
        onQuotaExceeded?.(errorMessage(e, "You have 0 credits remaining."));
      } else {
        setError(errorMessage(e, "Failed to run assessment. Please try again."));
      }
    } finally {
      setLoading(false);
    }
  }

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

      <div style={{ background:"var(--white)", border:"1px solid var(--border)", borderRadius:8, padding:20, marginBottom:16, overflowX:"auto" }}>
        {previewErr && <div style={{ fontSize:13, color:"var(--muted)" }}>{previewErr}</div>}
        {!preview && !previewErr && <div style={{ fontSize:13, color:"var(--muted)" }}>Loading preview…</div>}
        {preview && (
          <RatioTable
            ratios={preview.ratios}
            totalScore={preview.total_score}
            maxScore={preview.max_score}
            totalLabel="TOTAL (preview)"
            totalColor={preview.eligible ? "var(--score-full)" : "var(--error)"}
          />
        )}
      </div>

      <div style={{ display:"flex", flexDirection: isMobile ? "column-reverse" : "row", gap:10, justifyContent:"flex-end", marginTop:20, alignItems: isMobile ? "stretch" : "center" }}>
        <button onClick={onBack} style={{ padding:"9px 20px", fontSize:13, borderRadius:6, cursor:"pointer", border:"1px solid #D0D0D0", background:"transparent", color:"#1F2854", fontFamily:"Arial,sans-serif", textAlign:"center" }}>Back</button>

        {canProceed && !loading && (
          <button
            onClick={() => onNext(scoreResult, null, null, currentKey)}
            style={{ padding:"9px 20px", fontSize:13, borderRadius:6, cursor:"pointer", border:"1px solid #1F2854", background:"transparent", color:"#1F2854", fontFamily:"Arial,sans-serif", display:"flex", alignItems:"center", gap:6 }}>
            Continue to Result <ChevronRight size={14} />
          </button>
        )}

        {!canProceed && (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"stretch" }}>
             <button onClick={handleViewResult} disabled={loading}
              style={{ padding:"9px 20px", fontSize:13, borderRadius: loading ? "6px 6px 0 0" : 6, cursor: loading ? "not-allowed" : "pointer", border:"1px solid #1F2854", background: loading ? "#2a3870" : "#1F2854", color:"#fff", fontFamily:"Arial,sans-serif", display:"flex", alignItems:"center", gap:8 }}>
              {loading
                ? <><Loader size={14} style={{ animation:"spin 0.8s linear infinite", flexShrink:0 }} />{RUN_MESSAGES[msgIdx]}</>
                : <><Zap size={14} /> View Result</>
              }
            </button>
            {loading && (
              <div style={{ height:3, background:"rgba(31,40,84,0.15)", borderRadius:"0 0 6px 6px", overflow:"hidden" }}>
                <div style={{ height:"100%", background:"var(--accent)", width:`${Math.min(88, (msgIdx / (RUN_MESSAGES.length - 1)) * 88)}%`, transition:"width 0.9s ease" }} />
              </div>
            )}
            {hasResult && !figuresMatch && (
              <div style={{ fontSize:11, color:"#854F0B", marginTop:4, textAlign:"right" }}>
                ⚠ Figures changed — re-run to get updated result
              </div>
            )}
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}