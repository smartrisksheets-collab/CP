// Upload sub-step for a bond or note (terms read from a pricing supplement or term sheet, or typed)
// and for a loan or facility (typed). Saved in figures.terms; backend/api/instruments.py cleans them.
import { useState, useRef } from "react";
import { useIsMobile } from "../../hooks/useBreakpoint.js";
import { Upload as UploadIcon, CheckCircle, Loader, AlertTriangle, ChevronRight, SkipForward } from "lucide-react";
import { extractInstrumentTerms, errorMessage } from "../../api/client.js";
import { ACCEPT, prepareDocument, appendDocument } from "../../utils/documentInput.js";
import { TERM_FIELDS, instrumentLabel } from "../../utils/instruments.js";

const css = {
  card : { background:"#fff", border:"1px solid #E0E0E0", borderRadius:8, padding:20, marginBottom:16 },
  title: { fontSize:13, fontWeight:"bold", color:"#5A5A5A", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:14, paddingBottom:8, borderBottom:"1px solid #F0F0F0" },
  label: { fontSize:12, color:"#5A5A5A", display:"block", marginBottom:4 },
  input: { width:"100%", padding:"8px 10px", fontSize:13, border:"1px solid #D8D8D8", borderRadius:6, background:"#fff", color:"#1F2854", fontFamily:"Arial,sans-serif", boxSizing:"border-box" },
  zone : (hover) => ({ border:`2px dashed ${hover ? "var(--accent)" : "#D0D0D0"}`, borderRadius:8, padding:"24px 16px", textAlign:"center", cursor:"pointer", background: hover ? "#F8F8F5" : "transparent" }),
  done : { padding:"10px 14px", borderRadius:6, fontSize:13, background:"#EAF3DE", color:"#27500A", border:"1px solid #97C459", display:"flex", alignItems:"center", justifyContent:"space-between" },
  btn  : { padding:"9px 20px", fontSize:13, borderRadius:6, cursor:"pointer", fontFamily:"Arial,sans-serif", display:"flex", alignItems:"center", justifyContent:"center", gap:6 },
};

export default function InstrumentTerms({ instrument, figures, onFiguresChange, onBack, onNext, clientName }) {
  const isMobile = useIsMobile();
  const fieldsDef = TERM_FIELDS[instrument] || [];
  const isBond = instrument === "bond";
  const [fields, setFields] = useState(() => ({ ...(figures?.terms || {}) }));
  const [file, setFile] = useState(null);
  const [hover, setHover] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ref = useRef();

  const set = (k, v) => setFields((p) => ({ ...p, [k]: v }));

  async function handleFile(fileList) {
    setErr("");
    const { doc, error } = await prepareDocument(fileList);
    if (!doc) { setErr(error); return; }
    setFile(doc);
  }

  async function handleExtract() {
    setBusy(true); setErr("");
    try {
      const fd = new FormData();
      appendDocument(fd, "terms_pdf", file);
      fd.append("instrument", instrument);
      const res = await extractInstrumentTerms(fd);
      const data = res.data?.terms || {};
      setFields((prev) => {
        const next = { ...prev };
        for (const [k] of fieldsDef) if (data[k]) next[k] = String(data[k]);
        return next;
      });
    } catch (e) {
      setErr(errorMessage(e, "The terms could not be read. Fill them in below."));
    } finally {
      setBusy(false);
    }
  }

  function save(terms) {
    onFiguresChange({ ...figures, instrument, terms });
    onNext();
  }

  function handleContinue() {
    const terms = Object.fromEntries(fieldsDef.map(([k]) => [k, fields[k]?.trim() || null]));
    save(Object.values(terms).some(Boolean) ? terms : null);
  }

  const label = instrumentLabel(instrument);
  const g2 = { display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:12 };

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14, flexWrap:"wrap", gap:8 }}>
        {clientName && <span style={{ fontSize:13, color:"#5A5A5A" }}>Client: <strong style={{ color:"#1F2854" }}>{clientName}</strong></span>}
        <span style={{ fontSize:12, color:"#888", border:"1px solid #E0E0E0", borderRadius:20, padding:"3px 12px" }}>Optional: skip if not available</span>
      </div>

      {isBond && (
        <div style={css.card}>
          <div style={css.title}>Bond / Note Terms Document <span style={{ fontWeight:"normal", fontSize:11, color:"#888" }}>(optional)</span></div>
          {file ? (
            <div style={css.done}>
              <span><CheckCircle size={14} style={{ marginRight:6, verticalAlign:"middle" }} />{file.name}</span>
              <button onClick={() => setFile(null)} style={{ background:"none", border:"none", cursor:"pointer", color:"#27500A", fontSize:18, lineHeight:1 }}>&times;</button>
            </div>
          ) : (
            <>
              <input ref={ref} type="file" accept={ACCEPT} style={{ display:"none" }}
                onChange={(e) => e.target.files.length && handleFile(e.target.files)} />
              <div style={css.zone(hover)} onClick={() => ref.current.click()}
                onDragOver={(e) => { e.preventDefault(); setHover(true); }} onDragLeave={() => setHover(false)}
                onDrop={(e) => { e.preventDefault(); setHover(false); if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files); }}
                onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
                <UploadIcon size={28} style={{ margin:"0 auto 8px", opacity:0.35, display:"block" }} />
                <div style={{ fontSize:14, fontWeight:"bold", color:"#1F2854", marginBottom:4 }}>Click to upload the pricing supplement or term sheet</div>
                <div style={{ fontSize:12, color:"#888" }}>PDF only. The key terms are read into the fields below; check them before continuing.</div>
              </div>
            </>
          )}
          {file && !busy && (
            <button onClick={handleExtract} style={{ ...css.btn, marginTop:8, border:"1px solid #1F2854", background:"#1F2854", color:"#fff", padding:"8px 14px", fontSize:12 }}>
              Extract Fields
            </button>
          )}
          {busy && (
            <div style={{ marginTop:8, fontSize:12, color:"#1A5276", display:"flex", gap:8, alignItems:"center" }}>
              <Loader size={13} style={{ animation:"spin 0.8s linear infinite" }} /> Reading the terms…
            </div>
          )}
        </div>
      )}

      {err && (
        <div style={{ marginBottom:12, padding:"8px 12px", borderRadius:6, background:"#FEF6E7", border:"1px solid #F0C060", fontSize:12, color:"#7A4F00", display:"flex", gap:8 }}>
          <AlertTriangle size={13} style={{ flexShrink:0, marginTop:1 }} />{err}
        </div>
      )}

      <div style={css.card}>
        <div style={css.title}>{label} Terms</div>
        {!isBond && <div style={{ fontSize:12, color:"#5A5A5A", marginBottom:12 }}>Enter the facility being considered. The narrative judges repayment against the amount and tenor you give.</div>}
        <div style={g2}>
          {fieldsDef.filter(([, , wide]) => !wide).map(([k, lbl]) => (
            <div key={k}>
              <label style={css.label} htmlFor={`sr-term-${k}`}>{lbl}</label>
              <input id={`sr-term-${k}`} style={css.input} value={fields[k] || ""} onChange={(e) => set(k, e.target.value)} placeholder="—" />
            </div>
          ))}
        </div>
        {fieldsDef.filter(([, , wide]) => wide).map(([k, lbl]) => (
          <div key={k} style={{ marginTop:12 }}>
            <label style={css.label} htmlFor={`sr-term-${k}`}>{lbl}</label>
            <input id={`sr-term-${k}`} style={css.input} value={fields[k] || ""} onChange={(e) => set(k, e.target.value)} placeholder="—" />
          </div>
        ))}
      </div>

      <div style={{ display:"flex", flexDirection: isMobile ? "column-reverse" : "row", gap:10, justifyContent:"flex-end", marginTop:20 }}>
        <button onClick={onBack} style={{ ...css.btn, border:"1px solid #D0D0D0", background:"transparent", color:"#1F2854" }}>Back</button>
        <button onClick={() => save(null)} style={{ ...css.btn, border:"1px solid #D0D0D0", background:"transparent", color:"#888" }}>
          <SkipForward size={14} /> Skip
        </button>
        <button onClick={handleContinue} style={{ ...css.btn, border:"1px solid #1F2854", background:"#1F2854", color:"#fff" }}>
          Continue <ChevronRight size={14} />
        </button>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
