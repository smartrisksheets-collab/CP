// The issuer history analysis from backend/api/history.py: 3-year trend, indicative
// adjustment (shadow mode, never added to the score) and the half-year early warning.

const TREND_ROWS = [
  ["net_income_margin", "Net Income Margin", "margin"],
  ["interest_coverage", "Interest Coverage", "cover"],
  ["debt_to_ebitda",    "Net Debt / EBITDA", null],
  ["quick_ratio",       "Acid-Test Ratio",   "acid"],
  ["dscr",              "Debt Service Coverage *", null],
  ["altman_z",          "Altman Z'-Score *",  null],
];

const DIR = {
  improving: { text: "↑ Improving", color: "#1E7E34" },
  weakening: { text: "↓ Weakening", color: "#A32D2D" },
  stable   : { text: "→ Stable",    color: "#5F5E5A" },
  "n/a"    : { text: "n/a",         color: "#888" },
};

const pill = (bg, fg, border) => ({ fontSize:11, padding:"2px 10px", borderRadius:999, background:bg, color:fg, border:`1px solid ${border}`, fontWeight:600 });
const signed = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}`;

export default function HistoryPanel({ history, comment, onComment, commentError }) {
  if (!history) return null;

  const css = {
    card : { background:"#fff", border:"1px solid #E0E0E0", borderRadius:8, padding:20, marginBottom:16 },
    title: { fontSize:13, fontWeight:"bold", color:"#5A5A5A", textTransform:"uppercase", letterSpacing:"0.05em" },
    th   : { fontSize:11, fontWeight:"bold", color:"#888", padding:"8px 10px", borderBottom:"2px solid #E8E8E8", textAlign:"right", textTransform:"uppercase" },
    td   : { fontSize:13, padding:"8px 10px", borderBottom:"1px solid #F0F0F0", textAlign:"right", color:"#333" },
    box  : { background:"#F5F5F2", borderRadius:6, padding:14, flex:"1 1 280px", minWidth:0 },
    lbl  : { fontSize:11, fontWeight:"bold", color:"#888", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8 },
    row  : { display:"flex", justifyContent:"space-between", gap:12, fontSize:13, color:"#333", marginBottom:6 },
  };

  if (history.status !== "ok") {
    return (
      <div style={css.card}>
        <div style={{ ...css.title, marginBottom:8 }}>Historical Performance</div>
        <div style={{ fontSize:13, color:"#854F0B" }}>{history.message || "History could not be analysed."}</div>
      </div>
    );
  }

  const years    = history.years || [];
  const interim  = history.interim || {};
  const hasInt   = interim.status === "ok";
  const checks   = Object.fromEntries((interim.checks || []).map((c) => [c.id, c]));
  const dirById  = Object.fromEntries((history.direction || []).map((d) => [d.id, d]));
  const enough   = (history.yearsAvailable || 0) >= 2;
  const overallStyle = history.overall === "Weakening" ? pill("#FCEBEB", "#791F1F", "#F09595")
                     : history.overall === "Improving" ? pill("#EAF3DE", "#27500A", "#97C459")
                     : pill("#F1EFE8", "#5F5E5A", "#D8D8D8");
  const confStyle = history.confidence === "full" ? pill("#ecfdf5", "#065f46", "#6ee7b7")
                  : history.confidence === "partial" ? pill("#FEF6E7", "#7A4F00", "#F0C060")
                  : pill("#F1EFE8", "#5F5E5A", "#D8D8D8");

  return (
    <div style={css.card}>
      <div style={{ display:"flex", flexWrap:"wrap", gap:8, alignItems:"center", justifyContent:"space-between", marginBottom:12, paddingBottom:8, borderBottom:"1px solid #F0F0F0" }}>
        <div style={css.title}>Historical Performance</div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          <span style={overallStyle}>{history.overall}</span>
          <span style={confStyle}>Confidence: {history.confidence[0].toUpperCase() + history.confidence.slice(1)}</span>
        </div>
      </div>

      {!enough ? (
        <div style={{ fontSize:13, color:"#5A5A5A", marginBottom:12 }}>
          Only one financial year is available, so there is no trend and no adjustment. Upload an older audited statement to compare years.
        </div>
      ) : (
        <div style={{ overflowX:"auto", marginBottom:6 }}>
          <table style={{ borderCollapse:"collapse", width:"100%", minWidth: hasInt ? 720 : 560 }}>
            <thead>
              <tr>
                <th style={{ ...css.th, textAlign:"left" }}>Ratio</th>
                {years.map((y) => (
                  <th key={y.label} style={css.th}>{y.label}{y.audited === false ? " (unaudited)" : ""}</th>
                ))}
                <th style={{ ...css.th, textAlign:"left" }}>Trend</th>
                {hasInt && <th style={{ ...css.th, background:"#FFF8E1" }}>{interim.prior}</th>}
                {hasInt && <th style={{ ...css.th, background:"#FFF8E1" }}>{interim.current}</th>}
              </tr>
            </thead>
            <tbody>
              {TREND_ROWS.map(([id, label, checkId]) => {
                const dir = DIR[dirById[id]?.direction];
                const c   = checkId ? checks[checkId] : null;
                return (
                  <tr key={id}>
                    <td style={{ ...css.td, textAlign:"left", color:"#1F2854" }}>{label}</td>
                    {years.map((y) => <td key={y.label} style={css.td}>{y.ratios?.[id]?.display ?? "—"}</td>)}
                    <td style={{ ...css.td, textAlign:"left", fontWeight:600, color: dir?.color }}>{dir?.text || ""}</td>
                    {hasInt && <td style={{ ...css.td, background:"#FFFBF0" }}>{c ? c.prior : "—"}</td>}
                    {hasInt && (
                      <td style={{ ...css.td, background:"#FFFBF0", fontWeight: c?.triggered ? 700 : 400, color: c?.triggered ? "#854F0B" : "#333" }}>
                        {c ? `${c.current}${c.triggered ? " !" : ""}` : "—"}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ fontSize:11, color:"#888", marginTop:6 }}>
            * Context only, not part of the trend. Weakening or improving = a change of more than 10% from the oldest to the latest year.
          </div>
        </div>
      )}

      <div style={{ display:"flex", flexWrap:"wrap", gap:12, marginTop:12 }}>
        {enough && (
          <div style={css.box}>
            <div style={css.lbl}>Indicative history adjustment</div>
            <div style={css.row}><span>A. Direction</span><strong>{signed(history.components.direction)}</strong></div>
            <div style={css.row}><span>B. Stability <span style={{ color:"#888" }}>· {history.stability.detail}</span></span><strong>{signed(history.components.stability)}</strong></div>
            <div style={css.row}><span>C. Red flags <span style={{ color:"#888" }}>· {(history.redFlags || []).map((f) => f.label).join("; ") || "none"}</span></span><strong>{signed(history.components.redFlags)}</strong></div>
            <div style={{ ...css.row, borderTop:"1px solid #E0E0DA", paddingTop:8, marginTop:8, fontSize:14 }}>
              <span>Subtotal {signed(history.subtotal)} × confidence {history.factor.toFixed(1)}</span>
              <strong>{signed(history.adjustment)} pts</strong>
            </div>
            <div style={{ fontSize:11, color:"#854F0B" }}>Not applied to the score while the model is validated.</div>
          </div>
        )}

        <div style={{ ...css.box, background: hasInt && interim.triggered ? "#FFF8E1" : "#F5F5F2" }}>
          <div style={css.lbl}>Interim early warning{hasInt ? ` · ${interim.triggered} of ${interim.available} triggered` : ""}</div>
          {hasInt ? (
            <>
              {(interim.checks || []).map((c) => (
                <div key={c.id} style={css.row}>
                  <span>{c.label} <span style={{ color:"#888" }}>· {c.rule}</span></span>
                  <strong style={{ color: c.triggered ? "#854F0B" : c.triggered === false ? "#1E7E34" : "#888" }}>
                    {c.triggered ? "Triggered" : c.triggered === false ? "Passed" : "Not available"}
                  </strong>
                </div>
              ))}
              <div style={{ fontSize:11, color:"#888", marginTop:4 }}>{interim.current} against {interim.prior}, unaudited. The score is not changed.</div>
            </>
          ) : (
            <div style={{ fontSize:13, color:"#5A5A5A" }}>{interim.message || "No half-year interim report was provided."}</div>
          )}
          {onComment ? (
            hasInt && interim.triggered > 0 && (
              <div style={{ marginTop:10 }}>
                <label htmlFor="sr-analyst-comment" style={{ fontSize:12, fontWeight:600, color:"#5A5A5A", display:"block", marginBottom:4 }}>
                  Analyst comment on the triggered warnings (required)
                </label>
                <textarea id="sr-analyst-comment" rows={3} value={comment || ""} onChange={(e) => onComment(e.target.value)}
                  placeholder="e.g. what management or the arranger said about the half-year results"
                  style={{ width:"100%", boxSizing:"border-box", padding:"8px 10px", fontSize:13, borderRadius:6, fontFamily:"Arial,sans-serif",
                           border:`1px solid ${commentError ? "#A32D2D" : "#D8D8D8"}`, resize:"vertical" }} />
                {commentError && <div style={{ fontSize:12, color:"#A32D2D", marginTop:4 }}>{commentError}</div>}
              </div>
            )
          ) : history.analystComment ? (
            <div style={{ fontSize:13, color:"#333", marginTop:8 }}><strong>Analyst comment:</strong> {history.analystComment}</div>
          ) : null}
        </div>
      </div>

      {(history.notes?.length > 0 || history.confidenceReasons?.length > 0) && (
        <ul style={{ margin:"12px 0 0", paddingLeft:18, fontSize:12, color:"#5A5A5A", lineHeight:1.6 }}>
          {(history.notes || []).map((n, i) => (
            <li key={i}>
              {n.type === "restatement"
                ? `${n.period} figures differ between documents (${n.differences.map((d) => `${d.field} ${d.pct > 0 ? "+" : ""}${d.pct}%`).join(", ")}); the newer audited figures are used.`
                : n.message}
            </li>
          ))}
          {(history.confidenceReasons || []).map((r) => <li key={r}>{r}</li>)}
        </ul>
      )}
    </div>
  );
}
