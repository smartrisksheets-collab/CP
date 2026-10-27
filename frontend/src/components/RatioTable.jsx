import { Fragment } from "react";

// Group labels by the engine's ratio category, in report order
const GROUPS = {
  Liquidity    : "Liquidity Ratios",
  Profitability: "Profitability Ratios",
  Returns      : "Return Ratios",
  Leverage     : "Leverage Ratios",
  Coverage     : "Coverage Ratios",
  Bankruptcy   : "Corporate Bankruptcy",
};

function scoreTone(r) {
  if (r.display_only)          return { color:"var(--muted)",      background:"var(--chip-bg)" };
  if (r.score === r.max_score) return { color:"var(--score-full)", background:"var(--success-bg)" };
  if (r.score <= 0)            return { color:"var(--error)",      background:"var(--error-bg)" };
  return                              { color:"var(--score-part)", background:"var(--score-part-bg)" };
}

const th   = { textAlign:"left", fontSize:11, fontWeight:"bold", color:"var(--muted)", padding:"8px 10px", borderBottom:"2px solid var(--border)", textTransform:"uppercase" };
const td   = { padding:"10px", borderBottom:"1px solid var(--border)", verticalAlign:"middle" };
const cat  = { background:"var(--primary)", color:"var(--white)", fontSize:11, fontWeight:"bold", padding:"5px 10px", textTransform:"uppercase", letterSpacing:"0.04em" };
const chip = { fontSize:11, padding:"2px 8px", borderRadius:999, whiteSpace:"nowrap" };
const note = { ...td, fontSize:11, color:"var(--muted)" };

const groupOf = (r) => GROUPS[r.category] || r.category || "";

// One table for saved and preview results: rows come straight from the scoring engine
export default function RatioTable({ ratios = [], totalScore, maxScore, totalLabel = "TOTAL", totalColor }) {
  const rows = ratios.map((r, i) => {
    const group      = groupOf(r);
    const newGroup   = i === 0 || groupOf(ratios[i - 1]) !== group;
    const endOfGroup = i === ratios.length - 1 || groupOf(ratios[i + 1]) !== group;
    const infoNames  = endOfGroup ? ratios.filter(x => x.display_only && groupOf(x) === group).map(x => x.name) : [];
    const tone = scoreTone(r);

    return (
      <Fragment key={r.id || i}>
        {newGroup && <tr><td colSpan={4} style={cat}>{group}</td></tr>}
        <tr>
          <td style={td}>{r.name}</td>
          <td style={{ ...td, textAlign:"center" }}><span style={{ ...chip, ...tone }}>{r.display_value}</span></td>
          <td style={{ ...td, textAlign:"center" }}><span style={{ ...chip, background:"var(--chip-bg)", color:"var(--muted)" }}>{r.band || "N/A"}</span></td>
          <td style={{ ...td, textAlign:"right", fontWeight:"bold", color:tone.color }}>
            {r.display_only ? "Info only" : `${r.score} / ${r.max_score}`}
          </td>
        </tr>
        {infoNames.length > 0 && (
          <tr><td colSpan={4} style={note}>{infoNames.join(" and ")} {infoNames.length > 1 ? "are" : "is"} shown for information and {infoNames.length > 1 ? "are" : "is"} not part of the {maxScore}-point score.</td></tr>
        )}
      </Fragment>
    );
  });

  return (
    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13, minWidth:480 }}>
      <thead>
        <tr>
          <th style={th}>Ratio</th>
          <th style={{ ...th, textAlign:"center" }}>Result</th>
          <th style={{ ...th, textAlign:"center" }}>Band</th>
          <th style={{ ...th, textAlign:"right" }}>Score</th>
        </tr>
      </thead>
      <tbody>
        {rows}
        {totalScore !== undefined && (
          <tr style={{ background:"var(--bg)" }}>
            <td colSpan={3} style={{ ...td, fontWeight:"bold" }}>{totalLabel}</td>
            <td style={{ ...td, textAlign:"right", fontWeight:"bold", color:totalColor }}>{totalScore} / {maxScore}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
