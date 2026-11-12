import { periodLabel } from "../utils/history.js";

// Review Data: the prior years and interim found for the 3-year trend, one column per period.
// Everything lives in figures.history, so it autosaves with the draft and reaches the
// server engine (backend/api/history.py) unchanged.

const FIELDS = [
  ["revenue",                     "Revenue"],
  ["netIncome",                   "Net income"],
  ["ebit",                        "EBIT"],
  ["depreciationAndAmortisation", "Depreciation & amortisation"],
  ["financeCost",                 "Finance cost"],
  ["operatingCashFlow",           "Operating cash flow"],
  ["cash",                        "Cash & equivalents"],
  ["inventory",                   "Inventory"],
  ["prepaidExpenses",             "Prepaid expenses"],
  ["currentAssets",               "Current assets"],
  ["currentLiabilities",          "Current liabilities"],
  ["totalAssets",                 "Total assets"],
  ["totalLiabilities",            "Total liabilities"],
  ["shortTermDebt",               "Short-term debt"],
  ["longTermDebt",                "Long-term debt"],
  ["shareholdersEquity",          "Shareholders' equity"],
  ["retainedEarnings",            "Retained earnings"],
];

const SOURCE = {
  upload     : { text: "Uploaded",    bg: "#EEF4FF", fg: "#1A5276" },
  comparative: { text: "Comparative", bg: "#EEF4FF", fg: "#1A5276" },
  stored     : { text: "Stored",      bg: "#F1EFE8", fg: "#5F5E5A" },
};

const num = (v) => (v === "" || v === null || v === undefined ? null : parseFloat(v));

export default function HistoryEditor({ figures, onChange }) {
  const hist = figures.history;
  if (!hist) return null;
  const periods = hist.periods || [];

  const setHist = (patch) => onChange({ ...figures, history: { ...hist, ...patch } });
  const setPeriod = (i, patch) => setHist({ periods: periods.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const setFig = (i, key, v) => setPeriod(i, { figures: { ...(periods[i].figures || {}), [key]: num(v) } });
  const setOneOff = (i, key, v) => setPeriod(i, { oneOff: { ...(periods[i].oneOff || {}), [key]: key === "amount" ? num(v) : v } });
  const remove = (i) => setHist({ periods: periods.filter((_, j) => j !== i) });

  const css = {
    card : { background:"#fff", border:"1px solid #E0E0E0", borderRadius:8, padding:20, marginBottom:16 },
    title: { fontSize:13, fontWeight:"bold", color:"#5A5A5A", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:14, paddingBottom:8, borderBottom:"1px solid #F0F0F0" },
    label: { fontSize:12, color:"#5A5A5A", display:"block", marginBottom:4 },
    input: { width:"100%", padding:"7px 8px", fontSize:12, border:"1px solid #9DBFEA", background:"#EEF4FF", borderRadius:6, fontFamily:"Arial,sans-serif", color:"#1F2854", boxSizing:"border-box", textAlign:"right" },
    plain: { width:"100%", padding:"8px 10px", fontSize:13, border:"1px solid #D8D8D8", borderRadius:6, fontFamily:"Arial,sans-serif", color:"#1F2854", boxSizing:"border-box" },
    th   : { fontSize:11, color:"#5A5A5A", padding:"6px", textAlign:"right", verticalAlign:"bottom", minWidth:130 },
    td   : { padding:"3px 6px" },
    name : { fontSize:12, color:"#1F2854", padding:"3px 6px", whiteSpace:"nowrap" },
  };
  const restated = (hist.extractionNotes || []).filter((n) => n.type === "restatement");

  return (
    <div style={css.card}>
      <div style={css.title}>Prior Years &amp; Interim <span style={{ fontWeight:"normal", fontSize:11, color:"#888" }}>(3-year trend; does not change the score)</span></div>

      {(hist.warnings || []).map((w) => (
        <div key={w} style={{ padding:"8px 12px", borderRadius:6, fontSize:12, background:"#FEF6E7", color:"#7A4F00", border:"1px solid #F0C060", marginBottom:8 }}>{w}</div>
      ))}
      {restated.map((n) => (
        <div key={n.period} style={{ padding:"8px 12px", borderRadius:6, fontSize:12, background:"#FEF6E7", color:"#7A4F00", border:"1px solid #F0C060", marginBottom:8 }}>
          <strong>{n.period} figures differ between documents</strong> ({n.differences.map((d) => `${d.field} ${d.pct > 0 ? "+" : ""}${d.pct}%`).join(", ")}). The newer audited figures are shown below.
        </div>
      ))}

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:12, marginBottom:14 }}>
        <div>
          <label style={css.label} htmlFor="sr-h-rc">RC number (saves this history)</label>
          <input id="sr-h-rc" style={css.plain} value={hist.rcNumber || ""} onChange={(e) => setHist({ rcNumber: e.target.value })} placeholder="e.g. 123456" />
        </div>
        <div>
          <label style={css.label} htmlFor="sr-h-fy0">Year end of the scored statement</label>
          <input id="sr-h-fy0" style={css.plain} type="date" value={hist.fy0PeriodEnd || ""} onChange={(e) => setHist({ fy0PeriodEnd: e.target.value || null })} />
        </div>
        <div>
          <label style={css.label} htmlFor="sr-h-ocf">Operating cash flow, scored year (₦'000)</label>
          <input id="sr-h-ocf" style={{ ...css.plain, textAlign:"right" }} type="number" value={hist.fy0OperatingCashFlow ?? ""} onChange={(e) => setHist({ fy0OperatingCashFlow: num(e.target.value) })} />
        </div>
        <div>
          <label style={css.label} htmlFor="sr-h-fy0oo">One-off item in the scored year (₦'000)</label>
          <input id="sr-h-fy0oo" style={{ ...css.plain, textAlign:"right" }} type="number" placeholder="e.g. gain on disposal" value={hist.fy0OneOff?.amount ?? ""}
            onChange={(e) => setHist({ fy0OneOff: { ...(hist.fy0OneOff || {}), amount: num(e.target.value) } })} />
        </div>
        {hist.fy0OneOff?.amount ? (
          <div>
            <label style={css.label} htmlFor="sr-h-fy0oor">Reason (required)</label>
            <input id="sr-h-fy0oor" style={css.plain} value={hist.fy0OneOff?.reason || ""} onChange={(e) => setHist({ fy0OneOff: { ...hist.fy0OneOff, reason: e.target.value } })} />
          </div>
        ) : null}
      </div>

      {!hist.fy0PeriodEnd && (
        <div style={{ fontSize:12, color:"#854F0B", marginBottom:12 }}>Enter the year end of the scored statement so earlier years can be lined up.</div>
      )}

      {periods.length === 0 ? (
        <div style={{ fontSize:13, color:"#888" }}>No prior years were found. Upload an older audited statement on the Upload step, or add the RC number of an issuer assessed before.</div>
      ) : (
        <div style={{ overflowX:"auto" }}>
          <table style={{ borderCollapse:"collapse", width:"100%" }}>
            <thead>
              <tr>
                <th style={{ ...css.th, textAlign:"left", minWidth:170 }}>₦'000</th>
                {periods.map((p, i) => {
                  const src = SOURCE[p.source] || SOURCE.upload;
                  return (
                    <th key={`${p.periodEnd}-${p.periodMonths}`} style={{ ...css.th, background: Number(p.periodMonths) < 12 ? "#FFF8E1" : "transparent" }}>
                      <div style={{ fontSize:13, color:"#1F2854", fontWeight:"bold" }}>{periodLabel(p)}</div>
                      <div style={{ display:"flex", gap:4, justifyContent:"flex-end", alignItems:"center", marginTop:4, flexWrap:"wrap" }}>
                        <span style={{ fontSize:10, padding:"1px 6px", borderRadius:999, background:src.bg, color:src.fg }}>{src.text}</span>
                        <select aria-label={`${periodLabel(p)} audited`} value={p.audited === false ? "no" : p.audited ? "yes" : "unknown"}
                          onChange={(e) => setPeriod(i, { audited: e.target.value === "yes" ? true : e.target.value === "no" ? false : null })}
                          style={{ fontSize:10, padding:"1px 2px", border:"1px solid #D8D8D8", borderRadius:4 }}>
                          <option value="yes">Audited</option>
                          <option value="no">Unaudited</option>
                          <option value="unknown">Unknown</option>
                        </select>
                        <button type="button" onClick={() => remove(i)} aria-label={`Remove ${periodLabel(p)}`}
                          style={{ fontSize:14, lineHeight:1, background:"none", border:"none", cursor:"pointer", color:"#A32D2D", padding:"2px 4px" }}>×</button>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {FIELDS.map(([key, label]) => (
                <tr key={key}>
                  <td style={css.name}>{label}</td>
                  {periods.map((p, i) => (
                    <td key={`${p.periodEnd}-${p.periodMonths}`} style={{ ...css.td, background: Number(p.periodMonths) < 12 ? "#FFF8E1" : "transparent" }}>
                      <input type="number" aria-label={`${label} ${periodLabel(p)}`} style={css.input}
                        value={p.figures?.[key] ?? ""} onChange={(e) => setFig(i, key, e.target.value)} />
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td style={{ ...css.name, paddingTop:10 }}>One-off item (excluded from trend)</td>
                {periods.map((p, i) => (
                  <td key={`${p.periodEnd}-${p.periodMonths}`} style={{ ...css.td, paddingTop:10 }}>
                    <input type="number" aria-label={`One-off item ${periodLabel(p)}`} placeholder="0" style={{ ...css.input, background:"#fff", borderColor:"#D8D8D8" }}
                      value={p.oneOff?.amount ?? ""} onChange={(e) => setOneOff(i, "amount", e.target.value)} />
                    {p.oneOff?.amount ? (
                      <input aria-label={`One-off reason ${periodLabel(p)}`} placeholder="Reason (required)" style={{ ...css.input, background:"#fff", borderColor:"#D8D8D8", textAlign:"left", marginTop:4 }}
                        value={p.oneOff?.reason || ""} onChange={(e) => setOneOff(i, "reason", e.target.value)} />
                    ) : null}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <div style={{ fontSize:11, color:"#888", marginTop:8 }}>
        Company (standalone) figures. Half-years are shaded and are only compared with the same half of the year before. Stored years come from earlier assessments of this issuer on this account.
      </div>
    </div>
  );
}
