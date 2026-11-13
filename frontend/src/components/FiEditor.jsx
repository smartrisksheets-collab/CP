// Review Data: the issuer's sector and, for a financial issuer, the figures behind the FI ratios
// (backend/api/fi.py). The FI ratios are shown for context and are never part of the score.
import { SECTORS, FI_GROUPS, isFiSector } from "../utils/fi.js";

const AI  = { background:"#EEF4FF", borderColor:"#9DBFEA" };
const MAN = { background:"#ecfdf5", borderColor:"#01b88e" };

export default function FiEditor({ figures, onChange }) {
  const fi    = figures.fi || {};
  const isFi  = isFiSector(figures.sector);
  const extracted = Object.values(fi).some((v) => v !== null && v !== undefined && v !== "");

  const css = {
    card : { background:"#fff", border:"1px solid #E0E0E0", borderRadius:8, padding:20, marginBottom:16 },
    title: { fontSize:13, fontWeight:"bold", color:"#5A5A5A", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:14, paddingBottom:8, borderBottom:"1px solid #F0F0F0" },
    grid : { display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:12, alignItems:"end" },
    label: { fontSize:12, color:"#5A5A5A" },
    sub  : { fontSize:12, fontWeight:"bold", color:"#5A5A5A", margin:"14px 0 8px" },
    input: { width:"100%", padding:"8px 10px", fontSize:13, border:"1px solid", borderRadius:6, fontFamily:"Arial,sans-serif", color:"#1F2854", boxSizing:"border-box" },
  };

  function setSector(sector) {
    onChange({ ...figures, sector: sector || null });
  }

  function setField(id, value) {
    onChange({ ...figures, fi: { ...fi, [id]: value } });
  }

  return (
    <div style={css.card}>
      <div style={css.title}>Sector</div>
      <div style={{ maxWidth:420 }}>
        <label style={css.label} htmlFor="sr-review-sector">Issuer sector</label>
        <select id="sr-review-sector" style={{ ...css.input, borderColor:"#D0D0D0", background:"#fff", marginTop:4 }}
          value={figures.sector || ""} onChange={(e) => setSector(e.target.value)}>
          <option value="">Not set</option>
          {SECTORS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
        </select>
        <div style={{ fontSize:11, color:"#888", marginTop:4 }}>
          Financial services covers banks, finance companies, microfinance banks, leasing companies and lending fintechs.
          A payments fintech with no loan book is Fintech (payments) and keeps the standard ratios only.
        </div>
      </div>

      {isFi && (
        <>
          {figures.fiWarning && (
            <div style={{ marginTop:12, fontSize:12, color:"#854F0B" }}>{figures.fiWarning}</div>
          )}
          <div style={{ fontSize:12, color:"#5A5A5A", marginTop:12 }}>
            Financial-institution figures, for the FI ratios shown on the Scores step. They are for context and do not change the score.
            {!extracted && " Nothing was read for these yet: enter them from the loans, liquidity and capital notes."}
          </div>
          {FI_GROUPS.map(([group, fields]) => (
            <div key={group}>
              <div style={css.sub}>{group}</div>
              <div style={css.grid}>
                {fields.map(([id, label, kind]) => {
                  const v = fi[id];
                  const empty = v === null || v === undefined || v === "";
                  return (
                    <div key={id} style={{ display:"flex", flexDirection:"column", gap:4 }}>
                      <label style={css.label} htmlFor={`sr-fi-${id}`}>{label}</label>
                      <input id={`sr-fi-${id}`} type="number" step={kind === "pct" ? "0.01" : "1"}
                        style={{ ...css.input, ...(empty ? MAN : AI) }}
                        placeholder={kind === "pct" ? "e.g. 18.2 (%)" : "Leave blank if not shown"}
                        value={empty ? "" : v}
                        onChange={(e) => setField(id, e.target.value === "" ? null : parseFloat(e.target.value))} />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
