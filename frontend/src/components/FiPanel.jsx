// Scores and Result: the FI ratios for a financial issuer with verified peer medians
// (backend/api/fi.py, backend/api/benchmarks.py). Shown for context; never part of the score.

const pct = (v) => (v === null || v === undefined ? "—" : `${Number(v).toFixed(1)}%`);

export default function FiPanel({ fi }) {
  if (!fi) return null;

  const css = {
    card : { background:"#fff", border:"1px solid #E0E0E0", borderRadius:8, padding:20, marginBottom:16 },
    title: { fontSize:13, fontWeight:"bold", color:"#5A5A5A", textTransform:"uppercase", letterSpacing:"0.05em" },
    th   : { fontSize:11, fontWeight:"bold", color:"#888", padding:"8px 10px", borderBottom:"2px solid #E8E8E8", textAlign:"right", textTransform:"uppercase", whiteSpace:"nowrap" },
    td   : { fontSize:13, padding:"8px 10px", borderBottom:"1px solid #F0F0F0", textAlign:"right", color:"#333", whiteSpace:"nowrap" },
    note : { fontSize:11, color:"#888", marginTop:8 },
  };
  const pill = { fontSize:11, padding:"2px 10px", borderRadius:999, background:"#F1EFE8", color:"#5F5E5A", border:"1px solid #D8D8D8", fontWeight:600 };

  const header = (
    <div style={{ display:"flex", flexWrap:"wrap", gap:8, alignItems:"center", justifyContent:"space-between", marginBottom:12, paddingBottom:8, borderBottom:"1px solid #F0F0F0" }}>
      <div style={css.title}>Financial Institution Ratios</div>
      <span style={pill}>Indicative · not scored</span>
    </div>
  );

  if (fi.status !== "ok") {
    return (
      <div style={css.card}>
        {header}
        <div style={{ fontSize:13, color:"#854F0B" }}>{fi.message || "The FI ratios could not be worked out."}</div>
      </div>
    );
  }

  const hasPeer = fi.ratios.some((r) => r.peer);
  const notes = fi.ratios.filter((r) => r.note).map((r) => `${r.name}: ${r.note}.`);
  const groups = [...new Set(fi.ratios.filter((r) => r.peer).map((r) => `${r.peer.peerGroup}, FY${r.peer.fiscalYear}`))];

  return (
    <div style={css.card}>
      {header}
      <div style={{ fontSize:12, color:"#5A5A5A", marginBottom:10 }}>
        Banks and finance companies do not split current and non-current items, so these ratios read liquidity, asset quality and capital the way a lender reports them. The score above still uses the standard model.
      </div>
      <div style={{ overflowX:"auto" }}>
        <table style={{ borderCollapse:"collapse", width:"100%", minWidth: hasPeer ? 640 : 420 }}>
          <thead>
            <tr>
              <th style={{ ...css.th, textAlign:"left" }}>Ratio</th>
              <th style={css.th}>Issuer</th>
              {hasPeer && <th style={css.th}>Peer median</th>}
              {hasPeer && <th style={css.th}>Peer range (25–75%)</th>}
              {hasPeer && <th style={css.th}>Peers</th>}
            </tr>
          </thead>
          <tbody>
            {fi.ratios.map((r) => (
              <tr key={r.id}>
                <td style={{ ...css.td, textAlign:"left", whiteSpace:"normal" }}>
                  <div style={{ color:"#1F2854" }}>{r.name}</div>
                  <div style={{ fontSize:11, color:"#888" }}>{r.formula}</div>
                </td>
                <td style={{ ...css.td, fontWeight:600, color: r.value === null ? "#888" : "#1F2854" }}>{r.display}</td>
                {hasPeer && <td style={css.td}>{r.peer ? pct(r.peer.median) : "—"}</td>}
                {hasPeer && <td style={css.td}>{r.peer ? `${pct(r.peer.p25)} – ${pct(r.peer.p75)}` : "—"}</td>}
                {hasPeer && <td style={css.td}>{r.peer ? r.peer.n : "—"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {notes.length > 0 && <div style={css.note}>{notes.join(" ")}</div>}
      <div style={css.note}>
        {hasPeer
          ? `Peer group: ${groups.join("; ")}. Peers use their own definitions (for example NPL or Stage 3, group or bank), so read the comparison as a guide. A median shows only when at least 5 peers report the ratio.`
          : "No verified peer medians for this sector yet."}
      </div>
    </div>
  );
}
