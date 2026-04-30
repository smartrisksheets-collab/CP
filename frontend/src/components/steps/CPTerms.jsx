import { useState, useRef } from "react";
import { Upload as UploadIcon, CheckCircle, Loader, AlertTriangle, AlertCircle, X, ChevronRight, SkipForward } from "lucide-react";
import { extractCpTerms } from "../../api/client.js";

// ── Reuse validation helpers inline ──────────────────────────
const CP_REQUIRED_KW = [
  "commercial paper","tenor","discount rate","offer",
  "maturity","issuer","programme","implied yield",
  "offer open","offer close","funding date","subscription",
];
const CP_PROSPECTUS_KW = [
  "programme memorandum","information memorandum",
  "securities exchange commission","trust deed",
  "listing particulars","guarantee",
];

function countKw(text, list) {
  const lc = text.toLowerCase();
  return list.filter((k) => lc.includes(k.toLowerCase())).length;
}

let _pdfjs = null;
async function loadPdfJs() {
  if (_pdfjs) return _pdfjs;
  if (window.pdfjsLib) { _pdfjs = window.pdfjsLib; return _pdfjs; }
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  _pdfjs = window.pdfjsLib;
  return _pdfjs;
}

async function extractText(file, maxPages = 10) {
  const lib = await loadPdfJs();
  const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  const n   = Math.min(pdf.numPages, maxPages);
  let text  = "";
  for (let i = 1; i <= n; i++) {
    const content = await (await pdf.getPage(i)).getTextContent();
    text += content.items.map((s) => s.str).join(" ") + " ";
  }
  return { text, numPages: pdf.numPages };
}

async function validateCpPdf(file, clientName) {
  let text = "", numPages = 0;
  try { ({ text, numPages } = await extractText(file, 10)); }
  catch { return { ok: true, warnings: ["PDF could not be fully read. Accepted — verify extracted fields manually."] }; }

  if (text.replace(/\s/g, "").length < 300)
    return { ok: true, warnings: ["Scanned or image-based PDF. Accepted — verify all fields carefully."] };

  if (countKw(text, CP_REQUIRED_KW) < 4)
    return { ok: false, hard: "This does not appear to be an indicative terms email. Key CP terms were not found. Please upload the forwarded CP email PDF." };

  if (countKw(text, CP_PROSPECTUS_KW) >= 3)
    return { ok: false, hard: "This looks like a full Programme Memorandum, not an indicative terms email. Please upload the short forwarded email (typically 3–6 pages)." };

  const warnings = [];
  if (numPages > 6) warnings.push(`This document is ${numPages} pages — indicative terms emails are usually 3–6 pages. Verify all extracted fields.`);
  return { ok: true, warnings };
}

// ── Field definitions ─────────────────────────────────────────
const SHARED_FIELDS = [
  { key:"issuer",          label:"Issuer" },
  { key:"programmeSize",   label:"Programme Size" },
  { key:"targetSize",      label:"Target Size" },
  { key:"offerOpen",       label:"Offer Open Date" },
  { key:"offerClose",      label:"Offer Close Date" },
  { key:"fundingDate",     label:"Funding Date" },
  { key:"minSubscription", label:"Minimum Subscription" },
  { key:"issuerRating",    label:"Issuer Rating" },
  { key:"useOfProceeds",   label:"Use of Proceeds", wide: true },
  { key:"taxation",        label:"Taxation", wide: true },
];
const TRANCHE_FIELDS = [
  { keyA:"seriesA",       keyB:"seriesB",       label:"Series" },
  { keyA:"tenorA",        keyB:"tenorB",        label:"Tenor" },
  { keyA:"discountRateA", keyB:"discountRateB", label:"Discount Rate" },
  { keyA:"impliedYieldA", keyB:"impliedYieldB", label:"Implied Yield" },
];

const BLANK_CP = {
  issuer:"", programmeSize:"", targetSize:"", offerOpen:"", offerClose:"",
  fundingDate:"", minSubscription:"", issuerRating:"", useOfProceeds:"", taxation:"",
  seriesA:"", seriesB:"", tenorA:"", tenorB:"",
  discountRateA:"", discountRateB:"", impliedYieldA:"", impliedYieldB:"",
};

// ── Styles (match existing step styles) ─────────────────────
const css = {
  card   : { background:"#fff", border:"1px solid #E0E0E0", borderRadius:8, padding:20, marginBottom:16 },
  title  : { fontSize:13, fontWeight:"bold", color:"#5A5A5A", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:14, paddingBottom:8, borderBottom:"1px solid #F0F0F0" },
  label  : { fontSize:12, color:"#5A5A5A", display:"block", marginBottom:4 },
  input  : { width:"100%", padding:"8px 10px", fontSize:13, border:"1px solid #D8D8D8", borderRadius:6, background:"#fff", color:"#1F2854", fontFamily:"Arial,sans-serif", boxSizing:"border-box" },
  zone   : (hover) => ({ border:`2px dashed ${hover ? "var(--accent)" : "#D0D0D0"}`, borderRadius:8, padding:"28px 16px", textAlign:"center", cursor:"pointer", background: hover ? "#F8F8F5" : "transparent", transition:"all 0.15s" }),
  done   : { padding:"10px 14px", borderRadius:6, fontSize:13, background:"#EAF3DE", color:"#27500A", border:"1px solid #97C459", display:"flex", alignItems:"center", justifyContent:"space-between" },
  grid2  : { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 },
  grid3  : { display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 },
};

export default function CPTerms({ figures, onFiguresChange, onBack, onNext, clientName }) {
  const [file,       setFile]       = useState(null);
  const [validating, setValidating] = useState(false);
  const [fileError,  setFileError]  = useState("");
  const [fileWarns,  setFileWarns]  = useState([]);
  const [extracting, setExtracting] = useState(false);
  const [extractErr, setExtractErr] = useState("");
  const [fields,     setFields]     = useState(() => {
    const existing = figures?.cpTerms;
    return existing ? { ...BLANK_CP, ...existing } : { ...BLANK_CP };
  });
  const [hover, setHover] = useState(false);
  const ref = useRef();

  const set = (k, v) => setFields((p) => ({ ...p, [k]: v }));

  const hasAnyField = Object.values(fields).some((v) => v?.trim());

  async function handleFile(f) {
    setFile(f);
    setFileError("");
    setFileWarns([]);
    setValidating(true);
    const result = await validateCpPdf(f);
    setValidating(false);

    if (result.ok === false) {
      setFile(null);
      setFileError(result.hard);
      return;
    }
    setFileWarns(result.warnings || []);

    // Auto-extract
    setExtracting(true);
    setExtractErr("");
    try {
      const fd = new FormData();
      fd.append("cp_terms_pdf", f);
      const res  = await extractCpTerms(fd);
      const data = res.data?.cpTerms || {};
      setFields((prev) => {
        const merged = { ...prev };
        Object.keys(BLANK_CP).forEach((k) => {
          if (data[k] != null && data[k] !== "") merged[k] = String(data[k]);
        });
        return merged;
      });
    } catch {
      setExtractErr("AI extraction failed — please fill in the fields manually.");
    } finally {
      setExtracting(false);
    }
  }

  function handleContinue() {
    const cpTerms = hasAnyField
      ? Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v?.trim() || null]))
      : null;
    onFiguresChange({ ...figures, cpTerms });
    onNext();
  }

  function handleSkip() {
    onFiguresChange({ ...figures, cpTerms: null });
    onNext();
  }

  return (
    <div>
      {clientName && (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
          <span style={{ fontSize:13, color:"#5A5A5A" }}>Client: <strong style={{ color:"#1F2854" }}>{clientName.replace(/\b\w/g, c => c.toUpperCase())}</strong></span>
          <span style={{ fontSize:12, color:"#888", border:"1px solid #E0E0E0", borderRadius:20, padding:"3px 12px" }}>Optional — skip if not applicable</span>
        </div>
      )}
      <div style={{ fontSize:13, color:"#5A5A5A", marginBottom:14 }}>
        Upload the indicative terms email PDF to auto-fill the fields below, or enter them manually. This section is <strong>optional</strong> — click Skip if not applicable.
      </div>

      {/* Upload zone */}
      <div style={css.card}>
        <div style={css.title}>CP Indicative Terms PDF <span style={{ fontWeight:"normal", fontSize:11, color:"#888" }}>(optional)</span></div>

        {validating ? (
          <div style={{ padding:"12px 14px", borderRadius:6, fontSize:13, background:"#F0F4FF", color:"#1A5276", border:"1px solid #9DBFEA", display:"flex", alignItems:"center", gap:8 }}>
            <Loader size={14} style={{ animation:"spin 0.8s linear infinite", flexShrink:0 }} />
            Validating document…
          </div>
        ) : file ? (
          <div style={css.done}>
            <span><CheckCircle size={14} style={{ marginRight:6, verticalAlign:"middle" }} />{file.name}</span>
            <button onClick={() => { setFile(null); setFileError(""); setFileWarns([]); }}
              style={{ background:"none", border:"none", cursor:"pointer", color:"#27500A", fontSize:18, lineHeight:1 }}>&times;</button>
          </div>
        ) : (
          <>
            <input ref={ref} type="file" accept=".pdf" style={{ display:"none" }}
              onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])} />
            <div style={css.zone(hover)}
              onClick={() => ref.current.click()}
              onDragOver={(e) => { e.preventDefault(); setHover(true); }}
              onDragLeave={() => setHover(false)}
              onDrop={(e) => { e.preventDefault(); setHover(false); const f = e.dataTransfer.files[0]; if (f?.type === "application/pdf") handleFile(f); }}
              onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
            >
              <UploadIcon size={32} style={{ margin:"0 auto 10px", opacity:0.35, display:"block" }} />
              <div style={{ fontSize:14, fontWeight:"bold", color:"#1F2854", marginBottom:4 }}>Click to upload indicative terms email</div>
              <div style={{ fontSize:12, color:"#888" }}>Forwarded CP email PDF — AI will extract all fields below</div>
            </div>
          </>
        )}

        {fileError && (
          <div style={{ marginTop:8, padding:"10px 12px", borderRadius:6, background:"#FCEBEB", border:"1px solid #F09595", fontSize:12, color:"#791F1F", display:"flex", gap:8, alignItems:"flex-start" }}>
            <AlertCircle size={14} style={{ flexShrink:0, marginTop:1 }} />
            <span style={{ flex:1 }}>{fileError}</span>
            <button onClick={() => setFileError("")} style={{ background:"none", border:"none", cursor:"pointer", color:"#791F1F", padding:0 }}><X size={13} /></button>
          </div>
        )}
        {fileWarns.map((w, i) => (
          <div key={i} style={{ marginTop:8, padding:"8px 12px", borderRadius:6, background:"#FEF6E7", border:"1px solid #F0C060", fontSize:12, color:"#7A4F00", display:"flex", gap:8 }}>
            <AlertTriangle size={13} style={{ flexShrink:0, marginTop:1 }} />
            <span>{w}</span>
          </div>
        ))}
        {extracting && (
          <div style={{ marginTop:8, padding:"8px 12px", borderRadius:6, background:"#F0F4FF", border:"1px solid #9DBFEA", fontSize:12, color:"#1A5276", display:"flex", gap:8, alignItems:"center" }}>
            <Loader size={13} style={{ animation:"spin 0.8s linear infinite", flexShrink:0 }} />
            Extracting terms with AI…
          </div>
        )}
        {extractErr && (
          <div style={{ marginTop:8, padding:"8px 12px", borderRadius:6, background:"#FEF6E7", border:"1px solid #F0C060", fontSize:12, color:"#7A4F00", display:"flex", gap:8 }}>
            <AlertTriangle size={13} style={{ flexShrink:0, marginTop:1 }} />{extractErr}
          </div>
        )}
      </div>

      {/* Manual fields */}
      <div style={css.card}>
        <div style={css.title}>Indicative Terms</div>

        {/* Tranche table */}
        <div style={{ marginBottom:16 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
            <div style={{ fontSize:12, fontWeight:"bold", color:"#5A5A5A", paddingBottom:6, borderBottom:"2px solid #E0E0E0" }}></div>
            <div style={{ fontSize:12, fontWeight:"bold", color:"#5A5A5A", paddingBottom:6, borderBottom:"2px solid #E0E0E0", textAlign:"center" }}>Tranche A</div>
            <div style={{ fontSize:12, fontWeight:"bold", color:"#5A5A5A", paddingBottom:6, borderBottom:"2px solid #E0E0E0", textAlign:"center" }}>Tranche B</div>
          </div>
          {TRANCHE_FIELDS.map(({ keyA, keyB, label }) => (
            <div key={keyA} style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginTop:10 }}>
              <label style={{ ...css.label, marginBottom:0, alignSelf:"center" }}>{label}</label>
              <input style={css.input} value={fields[keyA] || ""} onChange={(e) => set(keyA, e.target.value)} placeholder="—" />
              <input style={css.input} value={fields[keyB] || ""} onChange={(e) => set(keyB, e.target.value)} placeholder="— (if 2nd tranche)" />
            </div>
          ))}
        </div>

        {/* Shared fields */}
        <div style={css.grid2}>
          {SHARED_FIELDS.filter((f) => !f.wide).map(({ key, label }) => (
            <div key={key}>
              <label style={css.label}>{label}</label>
              <input style={css.input} value={fields[key] || ""} onChange={(e) => set(key, e.target.value)} placeholder="—" />
            </div>
          ))}
        </div>
        {SHARED_FIELDS.filter((f) => f.wide).map(({ key, label }) => (
          <div key={key} style={{ marginTop:12 }}>
            <label style={css.label}>{label}</label>
            <input style={css.input} value={fields[key] || ""} onChange={(e) => set(key, e.target.value)} placeholder="—" />
          </div>
        ))}
      </div>

      <div style={{ display:"flex", gap:10, justifyContent:"flex-end", marginTop:20 }}>
        <button onClick={onBack}
          style={{ padding:"9px 20px", fontSize:13, borderRadius:6, cursor:"pointer", border:"1px solid #D0D0D0", background:"transparent", color:"#1F2854", fontFamily:"Arial,sans-serif" }}>
          Back
        </button>
        <button onClick={handleSkip}
          style={{ padding:"9px 20px", fontSize:13, borderRadius:6, cursor:"pointer", border:"1px solid #D0D0D0", background:"transparent", color:"#888", fontFamily:"Arial,sans-serif", display:"flex", alignItems:"center", gap:6 }}>
          <SkipForward size={14} /> Skip
        </button>
        <button onClick={handleContinue}
          style={{ padding:"9px 20px", fontSize:13, borderRadius:6, cursor:"pointer", border:"1px solid #1F2854", background:"#1F2854", color:"#fff", fontFamily:"Arial,sans-serif", display:"flex", alignItems:"center", gap:6 }}>
          Continue <ChevronRight size={14} />
        </button>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}