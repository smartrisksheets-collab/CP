import { useState, useRef } from "react";
import { Upload as UploadIcon, X, CheckCircle, Loader } from "lucide-react";
import { extractFigures } from "../../api/client.js";

const RATINGS = ["","AAA","AA+","AA","AA-","A+","A","A-","BBB+","BBB","BBB-","BB+","BB","BB-","B+","B","B-","CCC","CC","C","D"];

const css = {
  card    : { background:"#fff", border:"1px solid #E0E0E0", borderRadius:8, padding:20, marginBottom:16 },
  title   : { fontSize:13, fontWeight:"bold", color:"#5A5A5A", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:14, paddingBottom:8, borderBottom:"1px solid #F0F0F0" },
  grid    : { display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:12 },
  label   : { fontSize:12, color:"#5A5A5A", display:"block", marginBottom:4 },
  input   : { width:"100%", padding:"8px 10px", fontSize:13, border:"1px solid #D8D8D8", borderRadius:6, background:"#fff", color:"#1F2854", fontFamily:"Arial,sans-serif", boxSizing:"border-box" },
  select  : { width:"100%", padding:"8px 10px", fontSize:13, border:"1px solid #D8D8D8", borderRadius:6, background:"#fff", color:"#1F2854", fontFamily:"Arial,sans-serif" },
  zone    : (hover) => ({ border:`2px dashed ${hover ? "var(--accent)" : "#D0D0D0"}`, borderRadius:8, padding:"36px 16px", textAlign:"center", cursor:"pointer", background: hover ? "#F8F8F5" : "transparent", transition:"all 0.15s" }),
  done    : { padding:"10px 14px", borderRadius:6, fontSize:13, background:"#EAF3DE", color:"#27500A", border:"1px solid #97C459", display:"flex", alignItems:"center", justifyContent:"space-between" },
  info    : { padding:"10px 14px", borderRadius:6, fontSize:13, background:"#EEF4FF", color:"#1A5276", border:"1px solid #9DBFEA", display:"flex", alignItems:"center", justifyContent:"space-between" },
  actions : { display:"flex", gap:10, justifyContent:"flex-end", marginTop:20 },
  btn     : { padding:"9px 20px", fontSize:13, borderRadius:6, cursor:"pointer", border:"1px solid #1F2854", background:"#1F2854", color:"#fff", fontFamily:"Arial,sans-serif" },
  btnDis  : { padding:"9px 20px", fontSize:13, borderRadius:6, cursor:"not-allowed", border:"1px solid #D0D0D0", background:"#D0D0D0", color:"#fff", fontFamily:"Arial,sans-serif" },
};

function UploadZone({ label, sub, file, onFile, onClear }) {
  const [hover, setHover] = useState(false);
  const ref = useRef();

  if (file) return (
    <div style={css.done}>
      <span><CheckCircle size={14} style={{ marginRight:6, verticalAlign:"middle" }} />{file.name}</span>
      <button onClick={onClear} style={{ background:"none", border:"none", cursor:"pointer", color:"#27500A", fontSize:18, lineHeight:1 }}>&times;</button>
    </div>
  );

  return (
    <>
      <input ref={ref} type="file" accept=".pdf" style={{ display:"none" }}
        onChange={(e) => e.target.files[0] && onFile(e.target.files[0])} />
      <div style={css.zone(hover)}
        onClick={() => ref.current.click()}
        onDragOver={(e) => { e.preventDefault(); setHover(true); }}
        onDragLeave={() => setHover(false)}
        onDrop={(e) => { e.preventDefault(); setHover(false); const f = e.dataTransfer.files[0]; if (f?.type === "application/pdf") onFile(f); }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        <UploadIcon size={36} style={{ margin:"0 auto 12px", opacity:0.35, display:"block" }} />
        <div style={{ fontSize:14, fontWeight:"bold", color:"#1F2854", marginBottom:4 }}>{label}</div>
        <div style={{ fontSize:12, color:"#888" }}>{sub}</div>
      </div>
    </>
  );
}

export default function Upload({ clientInfo, onClientInfoChange, onExtractStart }) {
  const [finFile, setFinFile] = useState(null);
  const [ratFile, setRatFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const info = clientInfo;
  const set  = (k, v) => onClientInfoChange({ ...info, [k]: v });

  async function handleExtract() {
    if (!info.clientName?.trim()) { setError("Client name is required."); return; }
    if (!finFile)                  { setError("Please upload the financial statement PDF."); return; }
    setError("");
    setLoading(true);

    const fd = new FormData();
    fd.append("financial_pdf", finFile);
    if (ratFile) fd.append("rating_pdf", ratFile);

    const promise = extractFigures(fd)
      .then((res) => {
        const data = res.data;
        // Merge rating data into clientInfo
        if (data.ratingData) {
          onClientInfoChange({
            ...info,
            extractedRating: data.ratingData,
            creditRating: data.ratingData.longTermRating || info.creditRating,
          });
        }
        return data.figures;
      })
      .finally(() => setLoading(false));

    onExtractStart({
      ...info,
      reviewDate: info.reviewDate || new Date().toLocaleDateString("en-NG", { day:"2-digit", month:"short", year:"numeric" }),
    }, promise);
  }

  const canExtract = !!finFile && !!info.clientName?.trim() && !loading;

  return (
    <div>
      {error && (
        <div style={{ padding:"10px 14px", borderRadius:6, fontSize:13, background:"#FCEBEB", color:"#791F1F", border:"1px solid #F09595", marginBottom:12 }}>
          {error}
        </div>
      )}

      <div style={css.card}>
        <div style={css.title}>Client Information</div>
        <div style={{ ...css.grid }}>
          <div style={{ gridColumn:"span 2" }}>
            <label style={css.label}>Client name *</label>
            <input style={css.input} type="text" placeholder="e.g. Flour Mills of Nigeria Plc"
              value={info.clientName || ""} onChange={(e) => set("clientName", e.target.value)} />
          </div>
          <div>
            <label style={css.label}>Credit rating (external)</label>
            <select style={css.select} value={info.creditRating || ""} onChange={(e) => set("creditRating", e.target.value)}>
              {RATINGS.map((r) => <option key={r} value={r}>{r || "Select rating"}</option>)}
            </select>
          </div>
          <div>
            <label style={css.label}>Review date</label>
            <input style={css.input} type="text" placeholder="e.g. 31 March 2026"
              value={info.reviewDate || ""} onChange={(e) => set("reviewDate", e.target.value)} />
          </div>
        </div>
      </div>

      <div style={css.card}>
        <div style={css.title}>Financial Statement PDF</div>
        <UploadZone
          label="Click to upload financial statement"
          sub="Balance sheet + income statement — PDF only"
          file={finFile}
          onFile={setFinFile}
          onClear={() => setFinFile(null)}
        />
      </div>

      <div style={css.card}>
        <div style={css.title}>Credit Rating PDF <span style={{ fontWeight:"normal", fontSize:11, color:"#888" }}>(optional)</span></div>
        <UploadZone
          label="Click to upload credit rating report"
          sub="DataPro, Agusto & Co, or similar — PDF only"
          file={ratFile}
          onFile={setRatFile}
          onClear={() => setRatFile(null)}
        />
      </div>

      <div style={css.actions}>
        <button style={canExtract ? css.btn : css.btnDis} disabled={!canExtract} onClick={handleExtract}>
          {loading ? <><Loader size={14} style={{ verticalAlign:"middle", marginRight:6 }} />Extracting...</> : "Extract with AI"}
        </button>
      </div>
    </div>
  );
}